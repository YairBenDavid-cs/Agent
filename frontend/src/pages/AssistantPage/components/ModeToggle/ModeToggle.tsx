import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ConversationMode } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './ModeToggle.module.css';

interface ModeToggleProps {
  mode: ConversationMode;
  disabled?: boolean;
  onChange: (mode: ConversationMode) => void;
}

const AskIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const PlanIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const AutoIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
  </svg>
);

const ChevronIcon = (
  <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// Each mode's icon, label, and one-line descriptor of what the coach may do. The
// colour is applied to the icon (chip + menu) via a per-mode class so Plan reads
// orange, Auto amber. `ORDER` fixes the menu order.
const META: Record<ConversationMode, { label: string; desc: string; icon: ReactNode }> = {
  ask: { label: 'Ask', desc: 'answer only', icon: AskIcon },
  plan: { label: 'Plan', desc: 'edit program', icon: PlanIcon },
  auto: { label: 'Auto', desc: 'apply changes', icon: AutoIcon },
};
const ORDER: ConversationMode[] = ['ask', 'plan', 'auto'];

/**
 * Compact mode chip that opens a popover (above the chip) with Ask · Plan · Auto.
 * Ask = read-only (the coach answers, nothing changes), Plan = the coach can edit
 * your program, Auto = the coach applies changes autonomously. Controlled: the
 * selected mode is persisted by the caller — in a conversation via PATCH /:id/mode,
 * on the start screen by opening the new conversation in this mode.
 */
export function ModeToggle({ mode, disabled = false, onChange }: ModeToggleProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = META[mode];

  // Close on outside click / Escape while open (mirrors the design's document
  // listener). Only attached when open, and torn down on close/unmount.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  const pick = useCallback(
    (value: ConversationMode) =>
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        setOpen(false);
        if (value !== mode) onChange(value);
      },
    [mode, onChange],
  );

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.chip}
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mode: ${active.label}`}
      >
        <span className={`${styles.icon} ${styles[mode]}`}>{active.icon}</span>
        <span className={styles.chipLabel}>{active.label}</span>
        {ChevronIcon}
      </button>

      <div
        className={open ? `${styles.menu} ${styles.menuOpen}` : styles.menu}
        role="menu"
        aria-label="Conversation mode"
      >
        {ORDER.map((value) => {
          const m = META[value];
          return (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === mode}
              className={value === mode ? `${styles.item} ${styles.itemActive}` : styles.item}
              onClick={pick(value)}
            >
              <span className={`${styles.icon} ${styles[value]}`}>{m.icon}</span>
              <span className={styles.itemLabel}>{m.label}</span>
              <span className={styles.itemDesc}>{m.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
