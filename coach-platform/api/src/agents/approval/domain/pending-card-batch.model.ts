import { DraftKind } from '../approval-ttl.policy';

/**
 * Lifecycle of a generated week's approval card batch. The card *content* is
 * never stored — it is rebuilt live from `planned_sessions` (the source of
 * truth). This record is the thin bookkeeping that lets the UI list pending
 * drafts, lets the queue supersede a stale one, and lets the TTL sweep find
 * lapsed ones. Terminal statuses are immutable.
 */
export type CardBatchStatus =
  | 'pending'
  | 'approved'
  | 'revised'
  | 'rejected'
  | 'superseded'
  | 'expired'
  | 'auto_committed';

export const TERMINAL_BATCH_STATUSES: ReadonlySet<CardBatchStatus> = new Set([
  'approved',
  'rejected',
  'superseded',
  'expired',
  'auto_committed',
]);

/**
 * One generated tentative week awaiting the user's decision. Keyed for
 * supersession by (userId, programId, weekIndex); addressed by `id` (batchId),
 * which doubles as the revision idempotency key when the user revises.
 */
export interface PendingCardBatch {
  /** The batchId — opaque id the controller and revision trigger address. */
  id: string;
  userId: string;
  programId: string;
  weekIndex: number;
  /** Drives the TTL policy: session-day auto-commits, user-initiated expires. */
  kind: DraftKind;
  status: CardBatchStatus;
  /** The pipeline run that produced this draft (correlation/audit). */
  runId: string;
  /** Chat thread that fired the run, if any (null for the scheduled fetch). */
  conversationId: string | null;
  /**
   * WHY this draft was produced — the trigger's significance reason (e.g.
   * missed/deviated/unplanned sessions from a Garmin sync) plus the Recovery
   * verdict's rationale when the run produced one. Rendered on the proposal
   * and injected into the assistant's context so "why?" is answerable.
   */
  reason: string | null;
  /** Earliest session start (commit deadline for a session-day draft). */
  sessionStartUtc: string | null;
  createdAt: string;
  updatedAt: string;
}
