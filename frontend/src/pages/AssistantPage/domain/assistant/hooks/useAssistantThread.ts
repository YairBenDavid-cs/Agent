import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/api/ApiError';
import { postAssistantMessage } from '../api/assistantApi';
import type { AssistantTurn } from '../types/assistant';
import { useTurnHistory, type ThreadStatus } from './useTurnHistory';
import { useAssistantStream, type StreamPhase } from './useAssistantStream';

export type { ThreadStatus, StreamPhase };

interface UseAssistantThread {
  status: ThreadStatus;
  loadError: string | null;
  turns: AssistantTurn[];
  phase: StreamPhase;
  progressDetail: string;
  sendError: string | null;
  isBusy: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
}

interface UseAssistantThreadOptions {
  initialPrompt?: string | undefined;
  onReplyComplete?: (() => void) | undefined;
}

export function useAssistantThread(
  conversationId: string,
  options: UseAssistantThreadOptions = {},
): UseAssistantThread {
  const { initialPrompt, onReplyComplete } = options;

  const { status, loadError, turns, append, remove } = useTurnHistory(conversationId);
  const { phase: streamPhase, progressDetail, open, close } = useAssistantStream();

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
        (reply) => {
          abortRef.current = null;
          close();
          setPosting(false);
          append(reply);
          if (onReplyComplete !== undefined) {
            onReplyComplete();
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
    [conversationId, posting, append, remove, open, close, onReplyComplete],
  );

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
    progressDetail,
    sendError,
    isBusy,
    send,
    stop,
    retry,
  };
}
