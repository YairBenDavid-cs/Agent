import { useCallback, useEffect, useRef, useState } from 'react';
import { MOCK_API } from '@/shared/config';
import {
  assistantStreamUrl,
  parseWorkflowEvent,
  type WorkflowProgress,
} from '../stream/assistantStream';

export type StreamPhase = 'idle' | 'thinking';

interface UseAssistantStream {
  phase: StreamPhase;
  progress: WorkflowProgress | null;
  open: () => void;
  close: () => void;
}

// Shown in frontend-only mode, where there is no live workflow feed.
const MOCK_PROGRESS: WorkflowProgress = {
  agentName: 'coach',
  detail: 'query_performance',
};

/**
 * Subscribes to the user-wide agent-progress feed for the duration of a turn.
 * It surfaces the latest human-readable beat ("Coach is evaluating your week…")
 * while the synchronous reply POST is in flight. It carries NO reply text — the
 * reply comes back from the POST — and a dropped connection is non-fatal.
 */
export function useAssistantStream(): UseAssistantStream {
  const [phase, setPhase] = useState<StreamPhase>('idle');
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const close = useCallback((): void => {
    if (sourceRef.current !== null) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setPhase('idle');
    setProgress(null);
  }, []);

  const open = useCallback((): void => {
    setPhase('thinking');
    setProgress(null);

    if (MOCK_API) {
      setProgress(MOCK_PROGRESS);
      return;
    }

    // Auth rides in the httpOnly cookie; withCredentials attaches it on the
    // EventSource handshake.
    const source = new EventSource(assistantStreamUrl(), { withCredentials: true });
    sourceRef.current = source;

    source.addEventListener('workflow', (event) => {
      if (event instanceof MessageEvent && typeof event.data === 'string') {
        const data = parseWorkflowEvent(event.data);
        // Only activity beats move the indicator; `completed`/`exhausted` just
        // end a (possibly nested) loop — the next beat or the closing POST
        // supersedes them.
        if (data !== null && (data.phase === 'started' || data.phase === 'tool')) {
          const next: WorkflowProgress = { agentName: data.agentName };
          if (data.detail !== undefined) {
            next.detail = data.detail;
          }
          setProgress(next);
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

  return { phase, progress, open, close };
}
