import { useCallback, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { AssistantTurn } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import type { StreamPhase } from '@/pages/AssistantPage/domain/assistant/hooks/useAssistantThread';
import type { WorkflowProgress } from '@/pages/AssistantPage/domain/assistant/stream/assistantStream';
import { TurnItem } from '../components/TurnItem/TurnItem';
import { ThinkingPulse } from '../components/ThinkingPulse/ThinkingPulse';
import styles from './TurnList.module.css';

interface TurnListProps {
  turns: AssistantTurn[];
  phase: StreamPhase;
  progress: WorkflowProgress | null;
}

export function TurnList({ turns, phase, progress }: TurnListProps): ReactElement {
  const endRef = useRef<HTMLDivElement | null>(null);

  const scrollToEnd = useCallback((): void => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  // Keep the latest content in view as turns arrive and progress beats update.
  useEffect(() => {
    scrollToEnd();
  }, [turns, phase, progress, scrollToEnd]);

  // Turns present on first render are history — they show instantly. Only a
  // turn that ARRIVES during this mount gets the typewriter reveal, and only
  // the newest assistant one (an out-of-band reload can add several at once).
  const seenRef = useRef<Set<string> | null>(null);
  const isFirstRender = seenRef.current === null;
  if (seenRef.current === null) {
    seenRef.current = new Set(turns.map((t) => t.id));
  }

  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  // Sticky: once a turn starts animating it keeps the flag across re-renders
  // (the reveal finishes on its own), instead of snapping to full text.
  const animateRef = useRef<string | null>(null);
  if (!isFirstRender && lastAssistant !== undefined && !seenRef.current.has(lastAssistant.id)) {
    animateRef.current = lastAssistant.id;
  }
  const animateId = animateRef.current;

  useEffect(() => {
    const seen = seenRef.current;
    if (seen !== null) turns.forEach((t) => seen.add(t.id));
  }, [turns]);

  return (
    <div className={styles.list}>
      {turns.map((turn) => (
        <TurnItem
          key={turn.id}
          turn={turn}
          latest={turn.id === lastAssistant?.id}
          animate={turn.id === animateId}
          onGrow={scrollToEnd}
        />
      ))}

      {phase === 'thinking' && <ThinkingPulse progress={progress} />}

      <div ref={endRef} />
    </div>
  );
}
