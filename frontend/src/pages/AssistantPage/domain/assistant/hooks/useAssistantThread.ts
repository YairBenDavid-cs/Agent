import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/api/ApiError';
import {
  confirmBuildSlot,
  postAssistantMessage,
  resumeBuild,
} from '../api/assistantApi';
import type { AssistantTurn, AssistantTurnResult } from '../types/assistant';
import type { WorkflowProgress } from '../stream/assistantStream';
import { useTurnHistory, type ThreadStatus } from './useTurnHistory';
import { useAssistantStream, type StreamPhase } from './useAssistantStream';

export type { ThreadStatus, StreamPhase };

interface UseAssistantThread {
  status: ThreadStatus;
  loadError: string | null;
  turns: AssistantTurn[];
  phase: StreamPhase;
  progress: WorkflowProgress | null;
  sendError: string | null;
  isBusy: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
  // Build-flow actions (no-ops on ordinary chats). `confirmSlot` picks a proposed
  // calendar slot; `resume` re-greets an in-flight build (used on reopen + retry).
  confirmSlot: (scheduledStartUtc: string) => void;
  resume: () => void;
  // Re-fetch the transcript from the server. Used after out-of-band actions
  // (card approve/reject) that post assistant messages outside a chat turn.
  reloadTurns: () => void;
}

interface UseAssistantThreadOptions {
  initialPrompt?: string | undefined;
  onReplyComplete?: (() => void) | undefined;
  // Fired with the full turn outcome after the reply lands, so the view can
  // react to a fired pipeline (refresh the card), an Ask-mode intent block, or
  // an awaiting-confirmation question.
  onTurnComplete?: ((result: AssistantTurnResult) => void) | undefined;
  // A program_build conversation: turns persist slotProposal/buildRetry meta on
  // the message, so the thread reloads the transcript after a turn instead of
  // optimistically appending the (meta-less) reply.
  isBuild?: boolean | undefined;
}

export function useAssistantThread(
  conversationId: string,
  options: UseAssistantThreadOptions = {},
): UseAssistantThread {
  const { initialPrompt, onReplyComplete, onTurnComplete, isBuild = false } = options;

  const { status, loadError, turns, append, remove, reload } =
    useTurnHistory(conversationId);
  const { phase: streamPhase, progress, open, close } = useAssistantStream();

  const lastPromptRef = useRef<string | null>(null);
  const autoSentRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [posting, setPosting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const phase: StreamPhase = posting ? 'thinking' : streamPhase;
  const isBusy = posting;

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (trimmed === '' || posting) {
        return;
      }
      setSendError(null);
      lastPromptRef.current = trimmed;

      const optimisticId = `temp-${crypto.randomUUID()}`;
      const optimistic: AssistantTurn = {
        id: optimisticId,
        conversationId,
        role: 'user',
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      append(optimistic);
      setPosting(true);
      open();

      const controller = new AbortController();
      abortRef.current = controller;

      postAssistantMessage(conversationId, trimmed, controller.signal).then(
        (result) => {
          abortRef.current = null;
          close();
          setPosting(false);
          // Build turns carry their slotProposal/buildRetry meta on the persisted
          // message (not the POST body), so reload from the server to render the
          // authoritative transcript. Ordinary chats append the reply directly.
          if (isBuild) {
            reload();
          } else {
            append(result.turn);
          }
          if (onReplyComplete !== undefined) {
            onReplyComplete();
          }
          if (onTurnComplete !== undefined) {
            onTurnComplete(result);
          }
        },
        (err: unknown) => {
          abortRef.current = null;
          close();
          setPosting(false);
          // Stop() aborts the request on purpose — keep the user's turn, no error.
          if (controller.signal.aborted) {
            return;
          }
          remove(optimisticId);
          setSendError(err instanceof ApiError ? err.message : 'Failed to send your message.');
        },
      );
    },
    [
      conversationId,
      posting,
      append,
      remove,
      open,
      close,
      reload,
      isBuild,
      onReplyComplete,
      onTurnComplete,
    ],
  );

  // Confirm a proposed calendar slot. Like `send` but the user input is a pick,
  // not text, so there's no optimistic turn — we reload once the server advances.
  const confirmSlot = useCallback(
    (scheduledStartUtc: string): void => {
      if (posting) {
        return;
      }
      setSendError(null);
      setPosting(true);
      open();
      confirmBuildSlot(conversationId, scheduledStartUtc).then(
        (result) => {
          close();
          setPosting(false);
          reload();
          if (onReplyComplete !== undefined) {
            onReplyComplete();
          }
          if (onTurnComplete !== undefined) {
            onTurnComplete(result);
          }
        },
        (err: unknown) => {
          close();
          setPosting(false);
          setSendError(
            err instanceof ApiError ? err.message : 'Could not confirm that time.',
          );
        },
      );
    },
    [conversationId, posting, open, close, reload, onReplyComplete, onTurnComplete],
  );

  // Re-greet an in-flight build (reopen + buildRetry). The server only posts when
  // the build sits on an unperformed step; either way we reload the transcript.
  const resume = useCallback((): void => {
    if (posting) {
      return;
    }
    setSendError(null);
    setPosting(true);
    open();
    resumeBuild(conversationId).then(
      (result) => {
        close();
        setPosting(false);
        reload();
        if (result !== null && onTurnComplete !== undefined) {
          onTurnComplete(result);
        }
      },
      () => {
        close();
        setPosting(false);
        // Resume is best-effort; a failure just leaves the transcript as-is.
      },
    );
  }, [conversationId, posting, open, close, reload, onTurnComplete]);

  const stop = useCallback((): void => {
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    close();
    setPosting(false);
  }, [close]);

  const retry = useCallback((): void => {
    const last = lastPromptRef.current;
    if (last === null || posting) {
      return;
    }
    setSendError(null);
    send(last);
  }, [posting, send]);

  useEffect(() => {
    autoSentRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (
      status === 'ready' &&
      initialPrompt !== undefined &&
      initialPrompt.trim() !== '' &&
      !autoSentRef.current
    ) {
      autoSentRef.current = true;
      send(initialPrompt);
    }
  }, [status, initialPrompt, send]);

  return {
    status,
    loadError,
    turns,
    phase,
    progress,
    sendError,
    isBusy,
    send,
    stop,
    retry,
    confirmSlot,
    resume,
    reloadTurns: reload,
  };
}
