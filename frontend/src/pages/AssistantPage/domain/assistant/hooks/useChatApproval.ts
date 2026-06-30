import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/ApiError';
import {
  approveBatch,
  fetchApprovalBatch,
  rejectBatch,
  type ApprovalBatchView,
} from '@/pages/ProgramPage/api/approvalsApi';

interface UseChatApproval {
  batch: ApprovalBatchView | null;
  loadError: string | null;
  actionPending: boolean;
  actionError: string | null;
  // Re-fetch the batch view (recovers a superseded card).
  refresh: () => void;
  approve: () => void;
  reject: () => void;
}

interface UseChatApprovalOptions {
  // Called after a resolved approve/reject so the caller can re-derive the
  // conversation (its `pendingCardBatchId` may now be cleared).
  onResolved?: () => void;
}

/**
 * Resolves a conversation's `pendingCardBatchId` to the full batch view and
 * drives approve/reject off `allowedActions` — the chat-only entry point (the
 * ProgramPage card surface is read-only display).
 *
 * A `null` batch id (or a non-`pending` batch) is NOT an error: the panel shows
 * nothing / a "superseded" state, since a newer plan may have replaced this one
 * mid-conversation.
 */
export function useChatApproval(
  pendingCardBatchId: string | null,
  options: UseChatApprovalOptions = {},
): UseChatApproval {
  const { onResolved } = options;
  const [batch, setBatch] = useState<ApprovalBatchView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (pendingCardBatchId === null) {
      setBatch(null);
      setLoadError(null);
      return;
    }
    let active = true;
    setLoadError(null);
    fetchApprovalBatch(pendingCardBatchId)
      .then((view) => {
        if (active) setBatch(view);
      })
      .catch((err: unknown) => {
        // A missing/expired batch must not break the chat — treat as "no card".
        if (!active) return;
        setBatch(null);
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load the plan card.');
      });
    return () => {
      active = false;
    };
  }, [pendingCardBatchId, reloadKey]);

  const runAction = useCallback(
    (fn: () => Promise<unknown>) => {
      setActionPending(true);
      setActionError(null);
      fn()
        .then(() => {
          refresh();
          onResolved?.();
        })
        .catch((err: unknown) => {
          setActionError(err instanceof ApiError ? err.message : 'Action failed. Please try again.');
        })
        .finally(() => setActionPending(false));
    },
    [refresh, onResolved],
  );

  const approve = useCallback(() => {
    if (batch === null) return;
    runAction(() => approveBatch(batch.batchId));
  }, [batch, runAction]);

  const reject = useCallback(() => {
    if (batch === null) return;
    runAction(() => rejectBatch(batch.batchId));
  }, [batch, runAction]);

  return { batch, loadError, actionPending, actionError, refresh, approve, reject };
}
