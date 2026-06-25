import type { ReactElement } from 'react';

interface IconProps {
  className?: string | undefined;
}

export function SendIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}
