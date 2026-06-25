import type { ReactElement } from 'react';
import styles from './SubmitButton.module.css';

interface SubmitButtonProps {
  label: string;
  disabled: boolean;
}

export function SubmitButton({ label, disabled }: SubmitButtonProps): ReactElement {
  return (
    <button type="submit" className={styles.button} disabled={disabled}>
      {label}
    </button>
  );
}
