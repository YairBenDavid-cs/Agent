import type { ReactElement } from 'react';
import styles from './Avatar.module.css';

interface AvatarProps {
  src: string;
  alt: string;
  size?: number;
}

export function Avatar({ src, alt, size = 40 }: AvatarProps): ReactElement {
  if (src === '') {
    return (
      <span className={styles.fallback} style={{ width: size, height: size }} aria-label={alt}>
        {alt.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img className={styles.avatar} src={src} alt={alt} width={size} height={size} loading="lazy" />
  );
}
