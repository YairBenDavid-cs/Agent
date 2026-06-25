import type { ReactElement } from 'react';
import styles from './OptionChips.module.css';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface OptionGroupProps<T extends string> {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Single-select grid of chips. Exactly one option is active at a time. */
export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: OptionGroupProps<T>): ReactElement {
  return (
    <div className={styles.grid} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.chip} ${active ? styles.selected : ''}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            <span className={styles.label}>{option.label}</span>
            {option.hint !== undefined && <span className={styles.hint}>{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
