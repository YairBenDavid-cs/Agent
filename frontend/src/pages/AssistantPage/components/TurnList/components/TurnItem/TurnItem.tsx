import type { ReactElement } from 'react';
import { Markdown } from '@/shared/ui/Markdown/Markdown';
import { formatMessageTime } from '@/shared/utils/formatTime';
import type { AssistantTurn } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './TurnItem.module.css';

interface TurnItemProps {
  turn: AssistantTurn;
}

export function TurnItem({ turn }: TurnItemProps): ReactElement {
  const mine = turn.role === 'user';

  // User turns are short plain text in a rounded bubble; assistant turns are
  // full-width Markdown prose (headings, lists, tables, code) — matching the
  // Popvich Chat design.
  if (!mine) {
    return (
      <div className={styles.rowTheirs}>
        <div className={`${styles.bubble} ${styles.theirs}`}>
          <Markdown source={turn.text} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rowMine}>
      <div className={`${styles.bubble} ${styles.mine}`}>
        <span className={styles.text}>{turn.text}</span>
        <span className={styles.time}>{formatMessageTime(turn.createdAt)}</span>
      </div>
    </div>
  );
}
