import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/ApiError';
import { listAssistantTurns } from '../api/assistantApi';
import type { AssistantTurn } from '../types/assistant';

export type ThreadStatus = 'loading' | 'ready' | 'error';

interface UseTurnHistory {
  status: ThreadStatus;
  loadError: string | null;
  turns: AssistantTurn[];
  append: (turn: AssistantTurn) => void;
  replace: (id: string, turn: AssistantTurn) => void;
  remove: (id: string) => void;
}

export function useTurnHistory(conversationId: string): UseTurnHistory {
  const [status, setStatus] = useState<ThreadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setLoadError(null);
    setTurns([]);

    listAssistantTurns(conversationId).then(
      (history) => {
        if (!active) {
          return;
        }
        setTurns(history);
        setStatus('ready');
      },
      (err: unknown) => {
        if (!active) {
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load conversation');
        setStatus('error');
      },
    );

    return () => {
      active = false;
    };
  }, [conversationId]);

  const append = useCallback((turn: AssistantTurn): void => {
    setTurns((prev) => [...prev, turn]);
  }, []);

  const replace = useCallback((id: string, turn: AssistantTurn): void => {
    setTurns((prev) => prev.map((existing) => (existing.id === id ? turn : existing)));
  }, []);

  const remove = useCallback((id: string): void => {
    setTurns((prev) => prev.filter((existing) => existing.id !== id));
  }, []);

  return { status, loadError, turns, append, replace, remove };
}
