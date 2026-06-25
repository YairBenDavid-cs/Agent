import type { ReactElement } from 'react';
import { formatMessageTime } from '@/shared/utils/formatTime';
import type { AssistantTurn } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './TurnItem.module.css';

interface TurnItemProps {
  turn: AssistantTurn;
}

export function TurnItem({ turn }: TurnItemProps): ReactElement {
  const mine = turn.role === 'user';
  const rowClass = mine ? styles.rowMine : styles.rowTheirs;
  const bubbleClass = mine ? `${styles.bubble} ${styles.mine}` : `${styles.bubble} ${styles.theirs}`;

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        <span className={styles.text}>{turn.text}</span>
        <span className={styles.time}>{formatMessageTime(turn.createdAt)}</span>
      </div>
    </div>
  );
}
