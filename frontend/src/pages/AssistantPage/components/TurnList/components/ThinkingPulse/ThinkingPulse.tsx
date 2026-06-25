import type { ReactElement } from 'react';
import styles from './ThinkingPulse.module.css';

export function ThinkingPulse(): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.bubble} role="status" aria-label="Popvich is thinking">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
