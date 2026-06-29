import type { ReactElement } from 'react';
import styles from './Stepper.module.css';

export interface StepperItem {
  id: string;
  railTitle: string;
  railSubtitle: string;
}

interface StepperProps {
  steps: StepperItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
}

function CheckIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}

/** Left-rail vertical stepper. Completed/current rows can be clicked to revisit. */
export function Stepper({ steps, currentIndex, onSelect, disabled = false }: StepperProps): ReactElement {
  return (
    <ol className={styles.list}>
      {steps.map((item, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const reachable = index <= currentIndex;
        const isLast = index === steps.length - 1;
        return (
          <li key={item.id} className={styles.item}>
            <div className={styles.marker}>
              <button
                type="button"
                className={`${styles.dot} ${done ? styles.dotDone : ''} ${active ? styles.dotActive : ''}`}
                onClick={() => onSelect(index)}
                disabled={disabled || !reachable}
                aria-current={active ? 'step' : undefined}
                aria-label={`Go to step ${index + 1}: ${item.railTitle}`}
              >
                {done ? <CheckIcon /> : <span className={styles.dotNum}>{index + 1}</span>}
              </button>
              {!isLast && <span className={`${styles.line} ${done ? styles.lineDone : ''}`} />}
            </div>
            <div className={styles.text}>
              <span className={`${styles.title} ${active ? styles.titleActive : ''}`}>{item.railTitle}</span>
              <span className={styles.subtitle}>{item.railSubtitle}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
