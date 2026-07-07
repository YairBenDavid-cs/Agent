import type { ReactElement } from 'react';

interface IconProps {
  className?: string | undefined;
}

export function ScheduleIcon({ className }: IconProps): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8.5v4l3 2" />
      <path d="M9 2h6" />
    </svg>
  );
}
