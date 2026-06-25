import type { ReactElement } from 'react';
import type { AuthFieldProps } from '../types/authForm';
import styles from './EmailField.module.css';

export function EmailField({ value, onChange, disabled }: AuthFieldProps): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.label}>Email</span>
      <input
        className={styles.input}
        type="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="email"
        placeholder="Enter your email"
      />
    </label>
  );
}
