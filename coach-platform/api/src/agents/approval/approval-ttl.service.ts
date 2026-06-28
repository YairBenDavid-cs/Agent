import { Injectable, Logger } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import {
  classifyDraftTtl,
  DraftTtlState,
  TtlDecision,
} from './approval-ttl.policy';

export interface TtlTarget {
  userId: string;
  programId: string;
  weekIndex: number;
  state: DraftTtlState;
}

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

  constructor(private readonly approval: ApprovalService) {}

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
