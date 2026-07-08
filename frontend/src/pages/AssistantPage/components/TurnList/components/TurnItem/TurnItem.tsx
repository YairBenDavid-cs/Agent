import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Markdown } from '@/shared/ui/Markdown/Markdown';
import { CoachIcon } from '@/shared/ui/icons/CoachIcon';
import { formatMessageTime } from '@/shared/utils/formatTime';
import type { AssistantTurn } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './TurnItem.module.css';

interface TurnItemProps {
  turn: AssistantTurn;
  /** Latest assistant turn — gets the accent frame so it reads as "current". */
  latest?: boolean;
  /** Reveal the text progressively (typewriter) instead of as one block. */
  animate?: boolean;
  /** Called as revealed text grows, so the list can keep scrolled to bottom. */
  onGrow?: () => void;
}

// Characters revealed per tick — ~200 chars/s, a natural "streaming" pace.
const REVEAL_STEP = 4;
const REVEAL_INTERVAL_MS = 20;

/**
 * Progressive text reveal. The reply arrives in one POST (no token stream),
 * so this fakes the streaming feel client-side for freshly arrived turns.
 */
function useTypewriter(text: string, enabled: boolean, onGrow?: () => void): string {
  const [visible, setVisible] = useState(enabled ? 0 : text.length);

  useEffect(() => {
    if (!enabled || visible >= text.length) return undefined;
    const id = window.setInterval(() => {
      setVisible((v) => Math.min(v + REVEAL_STEP, text.length));
      onGrow?.();
    }, REVEAL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, visible, text.length, onGrow]);

  return enabled ? text.slice(0, visible) : text;
}

export function TurnItem({ turn, latest = false, animate = false, onGrow }: TurnItemProps): ReactElement {
  const mine = turn.role === 'user';
  const shown = useTypewriter(turn.text, !mine && animate, onGrow);

  // User turns are short plain text in a rounded bubble; assistant turns are
  // Markdown prose in a framed card. The latest assistant turn is highlighted
  // so it's clear which message is the current one vs. history.
  if (!mine) {
    return (
      <div className={styles.rowTheirs}>
        <span className={styles.avatar} aria-hidden="true">
          <CoachIcon />
        </span>
        <div className={`${styles.bubble} ${styles.theirs} ${latest ? styles.latest : ''}`}>
          <Markdown source={shown} />
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
