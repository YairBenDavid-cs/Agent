import type { ReactElement } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date' | 'time' | 'email' | 'password';
  placeholder?: string;
  optional?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
}

/**
 * Clamp the high side of a numeric input so a user can never submit a value
 * above `max` (HTML `max` only flags validity, it doesn't block typing). The low
 * side is left to per-step validation so partial entry like an empty field isn't
 * snapped to `min` mid-type.
 */
function clampToMax(
  raw: string,
  type: FieldProps['type'],
  max: number | undefined,
): string {
  if (type !== 'number' || max === undefined || raw.trim() === '') {
    return raw;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > max ? String(max) : raw;
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
  maxLength,
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
        onChange={(event) => onChange(clampToMax(event.target.value, type, max))}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        maxLength={type === 'text' ? maxLength : undefined}
      />
    </label>
  );
}
