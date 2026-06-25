import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/ApiError';
import { listAssistantConversations } from '../api/assistantApi';
import type { AssistantConversation } from '../types/assistant';

type Status = 'loading' | 'ready' | 'error';

interface UseAssistantConversations {
  conversations: AssistantConversation[];
  status: Status;
  error: string | null;
  upsert: (conversation: AssistantConversation) => void;
  touch: (id: string, lastMessageAt: string) => void;
  rename: (id: string, title: string) => void;
}

function sortByLastMessage(list: AssistantConversation[]): AssistantConversation[] {
  return [...list].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export function useAssistantConversations(): UseAssistantConversations {
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    listAssistantConversations().then(
      (list) => {
        if (!active) {
          return;
        }
        setConversations(sortByLastMessage(list));
        setStatus('ready');
      },
      (err: unknown) => {
        if (!active) {
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load conversations');
        setStatus('error');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const upsert = useCallback((conversation: AssistantConversation): void => {
    setConversations((prev) =>
      sortByLastMessage([
        conversation,
        ...prev.filter((existing) => existing.id !== conversation.id),
      ]),
    );
  }, []);

  const touch = useCallback((id: string, lastMessageAt: string): void => {
    setConversations((prev) =>
      sortByLastMessage(
        prev.map((conversation) =>
          conversation.id === id ? { ...conversation, lastMessageAt } : conversation,
        ),
      ),
    );
  }, []);

  const rename = useCallback((id: string, title: string): void => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === id ? { ...conversation, title } : conversation,
      ),
    );
  }, []);

  return { conversations, status, error, upsert, touch, rename };
}
