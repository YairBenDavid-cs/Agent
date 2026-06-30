import { useCallback, useEffect, useState } from 'react';
import { getAssistantConversation, setAssistantConversationMode } from '../api/assistantApi';
import type { AssistantConversation, ConversationMode } from '../types/assistant';

interface UseConversation {
  conversation: AssistantConversation | null;
  // Re-fetch the record (e.g. after a turn that fired a pipeline, so a fresh
  // `pendingCardBatchId` / cleared `attention` is reflected).
  refresh: () => void;
  // Resolves once the authoritative mode is persisted, so a caller can re-send a
  // refused message only after the server-side mode actually flipped.
  setMode: (mode: ConversationMode) => Promise<void>;
  modePending: boolean;
}

/**
 * Single source for one conversation's metadata (mode / origin / attention /
 * pendingCardBatchId). Other chat concerns derive from this rather than each
 * re-fetching the record: the approval card reads `pendingCardBatchId`, the
 * composer reads `mode`.
 */
export function useConversation(conversationId: string): UseConversation {
  const [conversation, setConversation] = useState<AssistantConversation | null>(null);
  const [modePending, setModePending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    getAssistantConversation(conversationId)
      .then((c) => {
        if (active) setConversation(c);
      })
      .catch(() => {
        if (active) setConversation(null);
      });
    return () => {
      active = false;
    };
  }, [conversationId, reloadKey]);

  const setMode = useCallback(
    (mode: ConversationMode): Promise<void> => {
      // Optimistic flip; reconcile to the authoritative record on the response.
      setConversation((prev) => (prev ? { ...prev, mode } : prev));
      setModePending(true);
      return setAssistantConversationMode(conversationId, mode)
        .then((c) => {
          setConversation(c);
        })
        .catch(() => {
          refresh();
        })
        .finally(() => setModePending(false));
    },
    [conversationId, refresh],
  );

  return { conversation, refresh, setMode, modePending };
}
