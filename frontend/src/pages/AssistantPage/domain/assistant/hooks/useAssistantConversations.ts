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
  remove: (id: string) => void;
  // Locally drop the attention flag (the backend clears it on the user's reply;
  // this mirrors that without a round-trip).
  clearAttention: (id: string) => void;
  // Re-pull the list from the server (e.g. after a `conversation` SSE push).
  refetch: () => void;
}

// Attention-first (a trigger flagged it for the user), then newest message. This
// pins the system "let's adjust your week" chats above the normal history.
function sortConversations(list: AssistantConversation[]): AssistantConversation[] {
  return [...list].sort((a, b) => {
    if (a.attention !== b.attention) {
      return a.attention ? -1 : 1;
    }
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export function useAssistantConversations(): UseAssistantConversations {
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    listAssistantConversations().then(
      (list) => {
        if (!active) {
          return;
        }
        setConversations(sortConversations(list));
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
  }, [reloadKey]);

  const upsert = useCallback((conversation: AssistantConversation): void => {
    setConversations((prev) =>
      sortConversations([
        conversation,
        ...prev.filter((existing) => existing.id !== conversation.id),
      ]),
    );
  }, []);

  const touch = useCallback((id: string, lastMessageAt: string): void => {
    setConversations((prev) =>
      sortConversations(
        prev.map((conversation) =>
          conversation.id === id ? { ...conversation, lastMessageAt } : conversation,
        ),
      ),
    );
  }, []);

  const clearAttention = useCallback((id: string): void => {
    setConversations((prev) =>
      sortConversations(
        prev.map((conversation) =>
          conversation.id === id ? { ...conversation, attention: false } : conversation,
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

  const remove = useCallback((id: string): void => {
    setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
  }, []);

  return { conversations, status, error, upsert, touch, rename, remove, clearAttention, refetch };
}
