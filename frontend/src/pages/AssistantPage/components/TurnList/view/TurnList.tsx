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
  streamingText: string;
}

export function TurnList({ turns, phase, streamingText }: TurnListProps): ReactElement {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest content in view as turns arrive and tokens stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, phase, streamingText]);

  return (
    <div className={styles.list}>
      {turns.map((turn) => (
        <TurnItem key={turn.id} turn={turn} />
      ))}

      {phase === 'thinking' && <ThinkingPulse />}

      {phase === 'streaming' && (
        <div className={styles.rowTheirs}>
          <div className={styles.streamingBubble}>
            <span className={styles.text}>{streamingText}</span>
            <span className={styles.caret} />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
