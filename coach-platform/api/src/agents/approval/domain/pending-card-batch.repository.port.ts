import { DraftKind } from '../approval-ttl.policy';
import { CardBatchStatus, PendingCardBatch } from './pending-card-batch.model';

export const PENDING_CARD_BATCH_REPOSITORY = Symbol(
  'PENDING_CARD_BATCH_REPOSITORY',
);

/** Fields needed to open a new pending batch. */
export interface NewCardBatch {
  userId: string;
  programId: string;
  weekIndex: number;
  kind: DraftKind;
  runId: string;
  conversationId: string | null;
  sessionStartUtc: string | null;
  reason: string | null;
}

/**
 * Persistence for approval card batches — the agent layer's own bookkeeping
 * (like the idempotency store), NOT a domain resource. Card content lives in
 * `planned_sessions`; this only tracks which draft is live and its lifecycle.
 */
export interface PendingCardBatchRepositoryPort {
  /**
   * Open a new pending batch, atomically superseding any still-pending batch for
   * the same (userId, programId, weekIndex). Returns the freshly-created batch.
   */
  createSuperseding(input: NewCardBatch): Promise<PendingCardBatch>;

  /** The batch by its id, scoped to the user; null if absent. */
  findByIdScoped(
    userId: string,
    batchId: string,
  ): Promise<PendingCardBatch | null>;

  /** All pending batches for the user, newest first. */
  findPending(userId: string): Promise<PendingCardBatch[]>;

  /** Move a batch to a terminal/intermediate status; returns the updated batch. */
  setStatus(
    userId: string,
    batchId: string,
    status: CardBatchStatus,
  ): Promise<PendingCardBatch | null>;

  /**
   * All still-pending batches across users, oldest first — the TTL sweep input.
   * Bounded by `limit` so one sweep tick stays cheap.
   */
  findAllPending(limit: number): Promise<PendingCardBatch[]>;
}
