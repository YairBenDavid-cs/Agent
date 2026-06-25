import type { ReactElement } from 'react';

interface IconProps {
  className?: string | undefined;
}

export function SidebarToggleIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M9.5 5.5v13" />
    </svg>
  );
}
