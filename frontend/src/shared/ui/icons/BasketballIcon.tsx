import type { ReactElement } from 'react';

interface IconProps {
  className?: string | undefined;
  size?: number;
}

export function BasketballIcon({ className, size = 26 }: IconProps): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="Popvich"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <circle cx="24" cy="24" r="19" strokeWidth="2.6" />
        <path d="M24 5v38" />
        <path d="M5 24h38" />
        <path d="M9 11c6 5 9 8 9 13s-3 8-9 13" />
        <path d="M39 11c-6 5-9 8-9 13s3 8 9 13" />
      </g>
    </svg>
  );
}
