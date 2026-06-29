import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';

// Frontend mirror of the backend approval contracts (agents/approval). A
// generated week is a batch of per-session cards the user acts on as a unit:
// approve (commit + calendar sync), revise (per-card feedback → re-plan), or
// reject (discard the draft). Card content is rebuilt live server-side; this
// client only carries the wire shapes the review UI renders.

export type CardDiffStatus = 'new' | 'modified' | 'unchanged' | 'removed';
export type ApprovalAction = 'approve' | 'revise' | 'reject';
export type CardBatchStatus =
  | 'pending'
  | 'approved'
  | 'revised'
  | 'rejected'
  | 'superseded'
  | 'expired'
  | 'auto_committed';

export interface ApprovalCard {
  sessionId: string;
  slotKey: string;
  type: string;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  intensityLabel: string;
  estDurationMin: number;
  coachNotes: string | null;
  placementNote: string | null;
  diffStatus: CardDiffStatus;
  changedFields: string[];
}

export interface ApprovalBatchView {
  batchId: string;
  programId: string;
  weekIndex: number;
  cards: ApprovalCard[];
  allowedActions: ApprovalAction[];
  status: CardBatchStatus;
  kind: string;
  conversationId: string | null;
}

export interface PendingCardBatch {
  id: string;
  programId: string;
  weekIndex: number;
  status: CardBatchStatus;
}

export interface CardRevisionEdit {
  plannedSessionId: string;
  freeText: string;
}

export interface ApproveResult {
  committed: number;
  calendar: { created: number; updated: number; deleted: number; skipped: number };
}

// GET /assistant/approvals — the caller's pending card batches.
export async function fetchPendingApprovals(): Promise<PendingCardBatch[]> {
  if (MOCK_API) {
    await delay();
    return [];
  }
  return request<PendingCardBatch[]>('/assistant/approvals');
}

// GET /assistant/approvals/:batchId — the full card set + lifecycle.
export async function fetchApprovalBatch(batchId: string): Promise<ApprovalBatchView> {
  return request<ApprovalBatchView>(`/assistant/approvals/${encodeURIComponent(batchId)}`);
}

// POST /assistant/approvals/:batchId/approve — commit the week + sync calendar.
export async function approveBatch(batchId: string): Promise<ApproveResult> {
  return request<ApproveResult>(`/assistant/approvals/${encodeURIComponent(batchId)}/approve`, {
    method: 'POST',
  });
}

// POST /assistant/approvals/:batchId/revise — per-card edits → fresh re-plan.
export async function reviseBatch(
  batchId: string,
  edits: CardRevisionEdit[],
): Promise<{ revisionBatchId: string | null }> {
  return request<{ revisionBatchId: string | null }>(
    `/assistant/approvals/${encodeURIComponent(batchId)}/revise`,
    { method: 'POST', body: { edits } },
  );
}

// POST /assistant/approvals/:batchId/reject — discard draft, keep committed.
export async function rejectBatch(batchId: string): Promise<{ discarded: number }> {
  return request<{ discarded: number }>(
    `/assistant/approvals/${encodeURIComponent(batchId)}/reject`,
    { method: 'POST' },
  );
}

// The synchronous outcome of a pipeline run. `null` when the queue deduped the
// job against an in-flight run for the same user.
export interface ProgramRunResult {
  status: 'completed' | 'aborted';
  abortReason?: string;
}

// POST /agents/program/generate — (re)generate the skeleton + current week. Used
// as the Retry action when first-time generation fails or times out. The
// pipeline runs synchronously server-side, so the response carries the run's
// terminal status — letting the UI surface an abort immediately.
export async function regenerateProgram(): Promise<ProgramRunResult | null> {
  if (MOCK_API) {
    await delay();
    return null;
  }
  return request<ProgramRunResult | null>('/agents/program/generate', { method: 'POST' });
}

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
