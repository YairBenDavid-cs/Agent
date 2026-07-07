import type { ReactElement } from 'react';

interface LogoIconProps {
  size?: number;
}

/** The AgentiCoach mark — a globe-like circle crossed by meridians. */
export function LogoIcon({ size = 28 }: LogoIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="19" />
      <path d="M24 5v38M5 24h38" />
      <path d="M24 5c-9 5-9 33 0 38" />
      <path d="M24 5c9 5 9 33 0 38" />
    </svg>
  );
}
