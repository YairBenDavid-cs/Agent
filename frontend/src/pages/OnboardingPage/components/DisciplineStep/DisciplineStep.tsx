import type { ReactElement, ReactNode } from 'react';
import type { Discipline } from '../../domain/types';
import styles from './DisciplineStep.module.css';

interface DisciplineOption {
  value: Discipline;
  label: string;
  desc: string;
  icon: ReactNode;
}

function svgWrap(children: ReactNode): ReactElement {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const OPTIONS: DisciplineOption[] = [
  {
    value: 'running',
    label: 'Running',
    desc: 'Endurance, tempo, intervals, long runs',
    icon: svgWrap(
      <>
        <circle cx="15" cy="4.5" r="1.6" />
        <path d="M13 8l-4 3 3 2.5V20" />
        <path d="M12 13.5l4 1.5 2 4" />
        <path d="M9 11l-3 1-1 4" />
      </>,
    ),
  },
  {
    value: 'strength',
    label: 'Strength',
    desc: 'Hypertrophy, powerlifting, athletic',
    icon: svgWrap(
      <>
        <path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" />
      </>,
    ),
  },
];

interface DisciplineStepProps {
  value: Discipline | null;
  onChange: (value: Discipline) => void;
  disabled: boolean;
}

export function DisciplineStep({ value, onChange, disabled }: DisciplineStepProps): ReactElement {
  return (
    <div className={styles.grid} role="radiogroup">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.tile} ${active ? styles.selected : ''}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            <span className={styles.icon} aria-hidden="true">
              {option.icon}
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{option.label}</span>
              <span className={styles.desc}>{option.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
