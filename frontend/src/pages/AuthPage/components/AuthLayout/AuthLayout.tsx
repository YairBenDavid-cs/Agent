import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import { Header } from '../Header/Header';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  prompt: string;
  actionLabel: string;
  actionTo: string;
  children: ReactNode;
}

export function AuthLayout({
  title,
  prompt,
  actionLabel,
  actionTo,
  children,
}: AuthLayoutProps): ReactElement {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link to="/auth" className={styles.brand}>
          <BasketballIcon className={styles.logoMark} size={32} />
          <span className={styles.brandName}>AgentiCoach</span>
        </Link>

        <Header title={title} />
        {children}

        <p className={styles.toggle}>
          {prompt}{' '}
          <Link to={actionTo} className={styles.toggleLink}>
            {actionLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
