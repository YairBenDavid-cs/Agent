import { useEffect, useRef } from 'react';
import { MOCK_API } from '@/shared/config';
import {
  assistantStreamUrl,
  parseConversationEvent,
  type ConversationEventData,
} from '../stream/assistantStream';

/**
 * Subscribes to the multiplexed agent stream's `conversation` events for the
 * lifetime of the mounted component. A trigger (e.g. the outcome-clarify path)
 * opens a pinned/flagged system chat server-side and pushes one of these beats;
 * the handler refetches the conversation list so the new chat appears WITHOUT
 * polling. Auth rides the httpOnly cookie (withCredentials); a dropped feed is
 * non-fatal and reconnects with a small backoff.
 */
export function useConversationEvents(onOpened: (event: ConversationEventData) => void): void {
  // Keep the latest handler without re-opening the stream each render.
  const handlerRef = useRef(onOpened);
  handlerRef.current = onOpened;

  useEffect(() => {
    if (MOCK_API) {
      return;
    }

    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = (): void => {
      source = new EventSource(assistantStreamUrl(), { withCredentials: true });

      source.addEventListener('conversation', (event) => {
        if (event instanceof MessageEvent && typeof event.data === 'string') {
          const data = parseConversationEvent(event.data);
          if (data !== null) {
            handlerRef.current(data);
          }
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        if (!closed) {
          retry = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry !== null) {
        clearTimeout(retry);
      }
      source?.close();
    };
  }, []);
}
