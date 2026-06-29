import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { AssistantTurn } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import type { StreamPhase } from '@/pages/AssistantPage/domain/assistant/hooks/useAssistantThread';
import { TurnItem } from '../components/TurnItem/TurnItem';
import { ThinkingPulse } from '../components/ThinkingPulse/ThinkingPulse';
import styles from './TurnList.module.css';

interface TurnListProps {
  turns: AssistantTurn[];
  phase: StreamPhase;
  progressDetail: string;
}

export function TurnList({ turns, phase, progressDetail }: TurnListProps): ReactElement {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest content in view as turns arrive and progress beats update.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, phase, progressDetail]);

  return (
    <div className={styles.list}>
      {turns.map((turn) => (
        <TurnItem key={turn.id} turn={turn} />
      ))}

      {phase === 'thinking' && <ThinkingPulse label={progressDetail} />}

      <div ref={endRef} />
    </div>
  );
}
