import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className, ...rest }: IconButtonProps): ReactElement {
  const classes = [styles.iconButton, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}
