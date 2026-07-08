import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { PlannedSessionResponse } from '../../planned-sessions/application/dto/planned-session.response';
import { GetWeekQuery } from '../../planned-sessions/application/queries/get-week.query';
import { DraftKind } from './approval-ttl.policy';
import {
  CardBatchStatus,
  PendingCardBatch,
} from './domain/pending-card-batch.model';
import {
  PENDING_CARD_BATCH_REPOSITORY,
  PendingCardBatchRepositoryPort,
} from './domain/pending-card-batch.repository.port';

export interface RecordBatchInput {
  userId: string;
  programId: string;
  weekIndex: number;
  kind: DraftKind;
  runId: string;
  conversationId?: string | null;
  reason?: string | null;
}

/**
 * Owns the pending-card-batch lifecycle record. Kept SEPARATE from
 * ApprovalService so the pipeline queue can persist a batch after a run without
 * importing ApprovalService (which transitively depends on the queue) — that
 * would be a cycle. This service depends only on the repository + a read query,
 * so the dependency graph stays acyclic.
 */
@Injectable()
export class PendingCardBatchService {
  private readonly logger = new Logger(PendingCardBatchService.name);

  constructor(
    @Inject(PENDING_CARD_BATCH_REPOSITORY)
    private readonly repository: PendingCardBatchRepositoryPort,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Persist a new pending batch for a freshly-generated tentative week,
   * superseding any prior pending batch for that week. The session-day commit
   * deadline is derived from the earliest tentative session's start.
   */
  async record(input: RecordBatchInput): Promise<PendingCardBatch> {
    const week = await this.queryBus.execute<
      GetWeekQuery,
      PlannedSessionResponse[]
    >(new GetWeekQuery(input.userId, input.programId, input.weekIndex));

    const sessionStartUtc = earliestTentativeStart(week);

    const batch = await this.repository.createSuperseding({
      userId: input.userId,
      programId: input.programId,
      weekIndex: input.weekIndex,
      kind: input.kind,
      runId: input.runId,
      conversationId: input.conversationId ?? null,
      sessionStartUtc,
      reason: input.reason ?? null,
    });
    this.logger.log(
      `Pending card batch ${batch.id} opened (${batch.kind}) for ${input.userId} week ${input.weekIndex}.`,
    );
    return batch;
  }

  get(userId: string, batchId: string): Promise<PendingCardBatch | null> {
    return this.repository.findByIdScoped(userId, batchId);
  }

  listPending(userId: string): Promise<PendingCardBatch[]> {
    return this.repository.findPending(userId);
  }

  setStatus(
    userId: string,
    batchId: string,
    status: CardBatchStatus,
  ): Promise<PendingCardBatch | null> {
    return this.repository.setStatus(userId, batchId, status);
  }

  findAllPending(limit: number): Promise<PendingCardBatch[]> {
    return this.repository.findAllPending(limit);
  }
}

/** Earliest scheduled start among the draft (tentative) sessions, or null. */
function earliestTentativeStart(week: PlannedSessionResponse[]): string | null {
  const starts = week
    .filter((s) => s.planState === 'tentative' && s.scheduledStartUtc)
    .map((s) => s.scheduledStartUtc)
    .sort();
  return starts.length > 0 ? starts[0] : null;
}
