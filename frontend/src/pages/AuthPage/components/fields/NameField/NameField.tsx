import type { ReactElement } from 'react';
import type { AuthFieldProps } from '../types/authForm';
import styles from './NameField.module.css';

export function NameField({ value, onChange, disabled }: AuthFieldProps): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.label}>Name</span>
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="name"
        placeholder="Enter your name"
      />
    </label>
  );
}
