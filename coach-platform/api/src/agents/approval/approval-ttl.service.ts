import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApprovalService } from './approval.service';
import {
  classifyDraftTtl,
  DraftTtlState,
  TtlDecision,
} from './approval-ttl.policy';
import { PendingCardBatchService } from './pending-card-batch.service';

export interface TtlTarget {
  userId: string;
  programId: string;
  weekIndex: number;
  state: DraftTtlState;
}

/** Max pending batches a single sweep tick processes (keeps the tick cheap). */
const SWEEP_LIMIT = 200;

/**
 * Applies the TTL policy to an unaddressed approval draft. Session-day drafts
 * auto-commit at session start (a plan MUST exist on time); user-initiated
 * drafts are discarded once they lapse past the inactivity window (status quo is
 * the safe default — the preference_event already persisted the intent). The
 * time-based decision is the pure `classifyDraftTtl`; this service only maps the
 * decision onto the approval actions. A scheduled job feeds it the live drafts.
 */
@Injectable()
export class ApprovalTtlService {
  private readonly logger = new Logger(ApprovalTtlService.name);

  constructor(
    private readonly approval: ApprovalService,
    private readonly batches: PendingCardBatchService,
  ) {}

  /**
   * Scheduled sweep: every pending batch is classified against the clock and, if
   * lapsed, auto-committed (session-day) or expired (user-initiated). Each batch
   * is isolated so one failure never stalls the rest. Runs hourly — fine-grained
   * enough for a 48h inactivity window and a session-start deadline.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(nowUtc: string = new Date().toISOString()): Promise<void> {
    const pending = await this.batches.findAllPending(SWEEP_LIMIT);
    if (pending.length === 0) {
      return;
    }
    this.logger.log(`TTL sweep over ${pending.length} pending batch(es).`);
    for (const batch of pending) {
      try {
        const decision = await this.enforce(
          {
            userId: batch.userId,
            programId: batch.programId,
            weekIndex: batch.weekIndex,
            state: {
              kind: batch.kind,
              createdAtUtc: batch.createdAt,
              sessionStartUtc: batch.sessionStartUtc,
            },
          },
          nowUtc,
        );
        if (decision === 'auto_commit') {
          await this.batches.setStatus(batch.userId, batch.id, 'auto_committed');
        } else if (decision === 'expire') {
          await this.batches.setStatus(batch.userId, batch.id, 'expired');
        }
      } catch (err) {
        this.logger.error(
          `TTL sweep failed for batch ${batch.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  async enforce(target: TtlTarget, nowUtc: string): Promise<TtlDecision> {
    const decision = classifyDraftTtl(target.state, nowUtc);
    const { userId, programId, weekIndex } = target;

    if (decision === 'auto_commit') {
      this.logger.log(
        `TTL auto-commit: session-day draft week ${weekIndex} for ${userId} reached session start.`,
      );
      await this.approval.approveWeek(userId, programId, weekIndex);
    } else if (decision === 'expire') {
      this.logger.log(
        `TTL expire: user-initiated draft week ${weekIndex} for ${userId} lapsed — keeping committed plan.`,
      );
      // A user-initiated draft always has a committed fallback to keep.
      await this.approval.rejectWeek(userId, programId, weekIndex, true);
    }

    return decision;
  }
}
