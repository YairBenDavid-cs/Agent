import type { ReactElement, ReactNode } from 'react';
import styles from './OptionChips.module.css';

export interface TileOption<T extends string> {
  value: T;
  label: string;
  description: string;
  icon?: ReactNode;
}

interface OptionTileGroupProps<T extends string> {
  options: TileOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Single-select grid of icon tiles. Exactly one option is active at a time. */
export function OptionTileGroup<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: OptionTileGroupProps<T>): ReactElement {
  return (
    <div className={styles.tileGrid} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.tile} ${active ? styles.tileSelected : ''}`}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.icon !== undefined && (
              <span className={styles.tileIcon} aria-hidden="true">
                {option.icon}
              </span>
            )}
            <span className={styles.tileText}>
              <span className={styles.tileLabel}>{option.label}</span>
              <span className={styles.tileDesc}>{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
