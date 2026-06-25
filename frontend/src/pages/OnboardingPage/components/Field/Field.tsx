import type { ReactElement } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date' | 'time';
  placeholder?: string;
  optional?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

/** A single labeled text/number/date input with a controlled string value. */
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  optional = false,
  disabled = false,
  min,
  max,
  step,
}: FieldProps): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        {optional && <span className={styles.optional}>optional</span>}
      </span>
      <input
        className={styles.input}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}
