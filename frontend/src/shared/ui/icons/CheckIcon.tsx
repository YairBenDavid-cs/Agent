import type { ReactElement } from 'react';

interface CheckIconProps {
  size?: number;
}

/** Rounded check mark used on primary "approve/apply" affordances. */
export function CheckIcon({ size = 16 }: CheckIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
