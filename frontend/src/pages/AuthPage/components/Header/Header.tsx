import type { ReactElement } from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps): ReactElement {
  return <h1 className={styles.header}>{title}</h1>;
}
