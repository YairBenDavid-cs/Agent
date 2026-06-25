import type { ReactElement } from 'react';
import styles from './Spinner.module.css';

export function Spinner(): ReactElement {
  return <span className={styles.spinner} role="status" aria-label="Loading" />;
}
