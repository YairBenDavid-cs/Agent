import type { ReactElement } from 'react';

interface BackArrowIconProps {
  className?: string | undefined;
}

/** A left-pointing arrow used to step back through the onboarding wizard. */
export function BackArrowIcon({ className }: BackArrowIconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 5l-7 7 7 7"
      />
    </svg>
  );
}
