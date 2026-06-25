import type { ReactElement } from 'react';
import type { AuthFieldProps } from '../types/authForm';
import styles from './PasswordField.module.css';

interface PasswordFieldProps extends AuthFieldProps {
  autoComplete?: 'current-password' | 'new-password';
}

export function PasswordField({
  value,
  onChange,
  disabled,
  autoComplete = 'current-password',
}: PasswordFieldProps): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.label}>Password</span>
      <input
        className={styles.input}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder="Enter your password"
      />
    </label>
  );
}
