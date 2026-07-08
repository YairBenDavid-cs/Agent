import type { ReactElement } from 'react';

interface CoachIconProps {
  size?: number;
}

/** Globe/orb mark shown beside every assistant (Popvich) reply. */
export function CoachIcon({ size = 28 }: CoachIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2 V22 M2 12 H22 M4.3 4.8 C9 8 9 16 4.3 19.2 M19.7 4.8 C15 8 15 16 19.7 19.2" />
    </svg>
  );
}
