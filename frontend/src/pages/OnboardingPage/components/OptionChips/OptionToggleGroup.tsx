import type { ReactElement } from 'react';
import type { ChipOption } from './OptionGroup';
import styles from './OptionChips.module.css';

interface OptionToggleGroupProps<T extends string> {
  options: ChipOption<T>[];
  values: T[];
  onToggle: (value: T) => void;
  disabled?: boolean;
}

/** Multi-select grid of chips. Any number of options can be active. */
export function OptionToggleGroup<T extends string>({
  options,
  values,
  onToggle,
  disabled = false,
}: OptionToggleGroupProps<T>): ReactElement {
  return (
    <div className={styles.grid} role="group">
      {options.map((option) => {
        const active = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`${styles.chip} ${active ? styles.selected : ''}`}
            onClick={() => onToggle(option.value)}
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
