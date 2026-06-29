import { useCallback, useEffect, useRef, useState } from 'react';
import { MOCK_API } from '@/shared/config';
import { assistantStreamUrl, parseWorkflowEvent } from '../stream/assistantStream';

export type StreamPhase = 'idle' | 'thinking';

interface UseAssistantStream {
  phase: StreamPhase;
  progressDetail: string;
  open: () => void;
  close: () => void;
}

// Shown in frontend-only mode, where there is no live workflow feed.
const MOCK_PROGRESS = 'Coach is reviewing your week…';

/**
 * Subscribes to the user-wide agent-progress feed for the duration of a turn.
 * It surfaces the latest human-readable beat ("Coach is evaluating your week…")
 * while the synchronous reply POST is in flight. It carries NO reply text — the
 * reply comes back from the POST — and a dropped connection is non-fatal.
 */
export function useAssistantStream(): UseAssistantStream {
  const [phase, setPhase] = useState<StreamPhase>('idle');
  const [progressDetail, setProgressDetail] = useState('');
  const sourceRef = useRef<EventSource | null>(null);

  const close = useCallback((): void => {
    if (sourceRef.current !== null) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setPhase('idle');
    setProgressDetail('');
  }, []);

  const open = useCallback((): void => {
    setPhase('thinking');
    setProgressDetail('');

    if (MOCK_API) {
      setProgressDetail(MOCK_PROGRESS);
      return;
    }

    // Auth rides in the httpOnly cookie; withCredentials attaches it on the
    // EventSource handshake.
    const source = new EventSource(assistantStreamUrl(), { withCredentials: true });
    sourceRef.current = source;

    source.addEventListener('workflow', (event) => {
      if (event instanceof MessageEvent && typeof event.data === 'string') {
        const data = parseWorkflowEvent(event.data);
        if (data !== null) {
          setProgressDetail(data.detail ?? `${data.agentName}…`);
        }
      }
    });

    // The progress feed is cosmetic: a dropped connection must not fail the
    // turn (the reply still returns over the POST), so just stop the beats.
    source.onerror = () => {
      if (sourceRef.current !== null) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, []);

  useEffect(() => close, [close]);

  return { phase, progressDetail, open, close };
}
