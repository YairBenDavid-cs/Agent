import type { ReactElement, ReactNode } from 'react';
import type { ConversationMode } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './ModeToggle.module.css';

interface ModeToggleProps {
  mode: ConversationMode;
  disabled?: boolean;
  onChange: (mode: ConversationMode) => void;
}

const PlanIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const AskIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
);

const MODES: { value: ConversationMode; label: string; hint: string; icon: ReactNode }[] = [
  { value: 'plan', label: 'Plan', hint: 'Plan · I can edit your program', icon: PlanIcon },
  { value: 'ask', label: 'Ask', hint: 'Ask · Read-only, questions only', icon: AskIcon },
];

/**
 * Segmented Plan/Ask pill by the composer, followed by a one-line explanation
 * of the active mode. Plan lets the coach mutate the program (filled orange =
 * capability on); Ask is read-only (neutral fill). A refused mutation surfaces
 * a "Switch to Plan" affordance. Flippable any time — persisted via PATCH /:id/mode.
 */
export function ModeToggle({ mode, disabled = false, onChange }: ModeToggleProps): ReactElement {
  const activeHint = MODES.find((m) => m.value === mode)?.hint ?? '';

  return (
    <div className={styles.wrap}>
      <div className={styles.toggle} role="group" aria-label="Conversation mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            data-mode={m.value}
            className={m.value === mode ? `${styles.option} ${styles.active}` : styles.option}
            onClick={() => onChange(m.value)}
            disabled={disabled || m.value === mode}
            aria-pressed={m.value === mode}
            title={m.hint}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>
      <span className={styles.hint} data-mode={mode}>
        <span className={styles.hintDot} aria-hidden="true" />
        {activeHint}
      </span>
    </div>
  );
}
