import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/auth/useAuth';
import { MOCK_API } from '@/shared/config';
import { mockRecordReply } from '../api/mockAssistant';
import {
  assistantStreamUrl,
  parseDoneEvent,
  parseErrorEvent,
  parseTitleEvent,
  parseToolEvent,
  parseTokenEvent,
} from '../stream/assistantStream';
import type { AssistantTurn } from '../types/assistant';

export type StreamPhase = 'idle' | 'thinking' | 'streaming';

interface UseAssistantStreamOptions {
  onDone?: ((reply: AssistantTurn) => void) | undefined;
  onReplyComplete?: (() => void) | undefined;
  onError?: (() => void) | undefined;
  onTitle?: ((title: string) => void) | undefined;
}

interface UseAssistantStream {
  phase: StreamPhase;
  streamingText: string;
  streamError: string | null;
  open: () => void;
  stop: () => AssistantTurn | null;
  reportError: (message: string) => void;
  clearError: () => void;
}

function onNamedEvent(
  source: EventSource,
  name: string,
  handler: (data: string) => void,
): void {
  source.addEventListener(name, (event) => {
    if (event instanceof MessageEvent && typeof event.data === 'string') {
      handler(event.data);
    }
  });
}

// Canned reply used in frontend-only mode so the dashboard streams like the
// real assistant without a backend. Removed once VITE_MOCK_API=false.
const MOCK_REPLY =
  'This is a preview of the assistant UI. The interface is fully wired — once the ' +
  'coach-platform backend is connected, real streamed answers will appear right here.';

export function useAssistantStream(
  conversationId: string,
  options: UseAssistantStreamOptions = {},
): UseAssistantStream {
  const { onDone, onReplyComplete, onError, onTitle } = options;
  const { session } = useAuth();
  const token = session?.token ?? null;

  const [phase, setPhase] = useState<StreamPhase>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const bufferRef = useRef('');
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const closeStream = useCallback((): void => {
    if (sourceRef.current !== null) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    if (mockTimerRef.current !== null) {
      // clearInterval also clears timeout ids in the browser, so this safely
      // tears down either the initial delay or the streaming interval.
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  }, []);

  const openMock = useCallback((): void => {
    bufferRef.current = '';
    setStreamingText('');
    setPhase('thinking');

    const words = MOCK_REPLY.split(' ');
    let index = 0;

    // Brief "thinking" pause, then stream the canned reply word by word.
    mockTimerRef.current = setTimeout(() => {
      mockTimerRef.current = setInterval(() => {
        if (index >= words.length) {
          closeStream();
          const reply: AssistantTurn = {
            id: crypto.randomUUID(),
            conversationId,
            role: 'assistant',
            text: bufferRef.current,
            createdAt: new Date().toISOString(),
          };
          mockRecordReply(conversationId, reply);
          if (onDone !== undefined) {
            onDone(reply);
          }
          bufferRef.current = '';
          setStreamingText('');
          setPhase('idle');
          if (onReplyComplete !== undefined) {
            onReplyComplete();
          }
          return;
        }
        bufferRef.current += (index === 0 ? '' : ' ') + words[index];
        index += 1;
        setStreamingText(bufferRef.current);
        setPhase('streaming');
      }, 45);
    }, 450);
  }, [conversationId, closeStream, onDone, onReplyComplete]);

  const open = useCallback((): void => {
    if (MOCK_API) {
      openMock();
      return;
    }
    if (token === null) {
      setStreamError('You are signed out. Please sign in again.');
      setPhase('idle');
      return;
    }
    bufferRef.current = '';
    setStreamingText('');
    setPhase('thinking');

    const source = new EventSource(assistantStreamUrl(conversationId, token));
    sourceRef.current = source;

    onNamedEvent(source, 'token', (raw) => {
      const data = parseTokenEvent(raw);
      if (data === null) {
        return;
      }
      bufferRef.current += data.delta;
      setStreamingText(bufferRef.current);
      setPhase('streaming');
    });

    onNamedEvent(source, 'tool', (raw) => {
      const data = parseToolEvent(raw);
      if (data === null) {
        return;
      }
      // While a tool runs no tokens arrive, so fall back to the thinking pulse
      // until the model resumes streaming its answer.
      if (data.phase === 'start') {
        setPhase('thinking');
      }
    });

    onNamedEvent(source, 'title', (raw) => {
      const data = parseTitleEvent(raw);
      if (data !== null && onTitle !== undefined) {
        onTitle(data.title);
      }
    });

    onNamedEvent(source, 'done', (raw) => {
      const data = parseDoneEvent(raw);
      closeStream();
      if (data !== null && onDone !== undefined) {
        onDone({
          id: data.messageId,
          conversationId,
          role: 'assistant',
          text: bufferRef.current,
          createdAt: new Date().toISOString(),
        });
      }
      bufferRef.current = '';
      setStreamingText('');
      setPhase('idle');
      if (onReplyComplete !== undefined) {
        onReplyComplete();
      }
    });

    onNamedEvent(source, 'error', (raw) => {
      const data = parseErrorEvent(raw);
      closeStream();
      bufferRef.current = '';
      setStreamingText('');
      setPhase('idle');
      if (onError !== undefined) {
        onError();
      }
      setStreamError(data?.message ?? 'The assistant could not complete the reply.');
    });

    source.onerror = () => {
      if (sourceRef.current === null) {
        return;
      }
      closeStream();
      bufferRef.current = '';
      setStreamingText('');
      setPhase('idle');
      if (onError !== undefined) {
        onError();
      }
      setStreamError('Connection lost. Please try again.');
    };
  }, [conversationId, token, closeStream, openMock, onDone, onReplyComplete, onError, onTitle]);

  const stop = useCallback((): AssistantTurn | null => {
    closeStream();
    const partial = bufferRef.current;
    const reply: AssistantTurn | null =
      partial !== ''
        ? {
            id: `partial-${crypto.randomUUID()}`,
            conversationId,
            role: 'assistant',
            text: partial,
            createdAt: new Date().toISOString(),
          }
        : null;
    bufferRef.current = '';
    setStreamingText('');
    setPhase('idle');
    return reply;
  }, [conversationId, closeStream]);

  const reportError = useCallback((message: string): void => {
    setPhase('idle');
    setStreamError(message);
  }, []);

  const clearError = useCallback((): void => {
    setStreamError(null);
  }, []);

  useEffect(() => closeStream, [conversationId, closeStream]);

  return { phase, streamingText, streamError, open, stop, reportError, clearError };
}
