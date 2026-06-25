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
  streamingText: string;
  streamError: string | null;
  isBusy: boolean;
  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
}

interface UseAssistantThreadOptions {
  initialPrompt?: string | undefined;
  onReplyComplete?: (() => void) | undefined;
  onTitle?: ((title: string) => void) | undefined;
}

export function useAssistantThread(
  conversationId: string,
  options: UseAssistantThreadOptions = {},
): UseAssistantThread {
  const { initialPrompt, onReplyComplete, onTitle } = options;

  const { status, loadError, turns, append, replace, remove } = useTurnHistory(conversationId);

  const lastPromptRef = useRef<string | null>(null);
  const needsResendRef = useRef(false);
  const autoSentRef = useRef(false);
  const [posting, setPosting] = useState(false);

  const onStreamError = useCallback((): void => {
    needsResendRef.current = false;
  }, []);

  const {
    phase: streamPhase,
    streamingText,
    streamError,
    open,
    stop: stopStream,
    reportError,
    clearError,
  } = useAssistantStream(conversationId, {
    onDone: append,
    onReplyComplete,
    onError: onStreamError,
    onTitle,
  });

  const phase: StreamPhase = posting ? 'thinking' : streamPhase;
  const isBusy = posting || streamPhase !== 'idle';

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (trimmed === '' || posting || streamPhase !== 'idle') {
        return;
      }
      clearError();
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

      postAssistantMessage(conversationId, trimmed).then(
        (saved) => {
          replace(optimisticId, saved);
          setPosting(false);
          open();
        },
        (err: unknown) => {
          remove(optimisticId);
          setPosting(false);
          needsResendRef.current = true;
          reportError(err instanceof ApiError ? err.message : 'Failed to send your message.');
        },
      );
    },
    [conversationId, posting, streamPhase, append, replace, remove, open, reportError, clearError],
  );

  const stop = useCallback((): void => {
    const partial = stopStream();
    if (partial !== null) {
      append(partial);
    }
  }, [stopStream, append]);

  const retry = useCallback((): void => {
    const last = lastPromptRef.current;
    if (last === null || posting || streamPhase !== 'idle') {
      return;
    }
    clearError();
    if (needsResendRef.current) {
      send(last);
    } else {
      open();
    }
  }, [posting, streamPhase, clearError, open, send]);

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
    streamingText,
    streamError,
    isBusy,
    send,
    stop,
    retry,
  };
}
