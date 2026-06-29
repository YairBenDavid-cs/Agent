import type { ReactElement } from 'react';
import styles from './ThinkingPulse.module.css';

interface ThinkingPulseProps {
  label?: string;
}

export function ThinkingPulse({ label }: ThinkingPulseProps): ReactElement {
  const status = label !== undefined && label !== '' ? label : 'Popvich is thinking';
  return (
    <div className={styles.row}>
      <div className={styles.bubble} role="status" aria-label={status}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      {label !== undefined && label !== '' && <span className={styles.label}>{label}</span>}
    </div>
  );
}
