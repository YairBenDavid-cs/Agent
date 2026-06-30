import { useCallback, useEffect, useRef, useState } from 'react';
import { closeAssistantConversation } from '../api/assistantApi';

const MOCK_API = import.meta.env.VITE_MOCK_API !== 'false';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// Ends the assistant "session". POST /:id/close fires the staging-buffer flush
// server-side (distilling the conversation into durable memory) — it never
// deletes the chat. We also fire a best-effort beacon when the tab is hidden or
// unloaded, so a user who just closes the window still gets their buffer
// flushed. The beacon is guarded to fire at most once per conversation in view.
export function useConversationClose(conversationId: string): {
  closing: boolean;
  close: () => Promise<void>;
} {
  const [closing, setClosing] = useState(false);
  const beaconSent = useRef(false);

  useEffect(() => {
    // A new conversation entered view — re-arm the one-shot beacon for it.
    beaconSent.current = false;
    if (MOCK_API) {
      return;
    }
    const url = `${API_BASE}/assistant/conversations/${conversationId}/close`;
    function sendOnce(): void {
      if (beaconSent.current) {
        return;
      }
      beaconSent.current = true;
      navigator.sendBeacon(url);
    }
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') {
        sendOnce();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', sendOnce);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sendOnce);
    };
  }, [conversationId]);

  const close = useCallback(async (): Promise<void> => {
    // An explicit end supersedes the unload beacon — don't double-fire.
    beaconSent.current = true;
    setClosing(true);
    try {
      await closeAssistantConversation(conversationId);
    } finally {
      setClosing(false);
    }
  }, [conversationId]);

  return { closing, close };
}
