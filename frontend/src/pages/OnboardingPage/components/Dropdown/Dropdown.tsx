import { useState, type ReactElement, type ReactNode } from 'react';
import controls from '../controls.module.css';

interface DropdownProps {
  /** Trigger label; `placeholder` styling applies when nothing is selected. */
  label: ReactNode;
  placeholder?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** Right-align a fixed-width popover (used for the timezone menu). */
  wide?: boolean;
  /** Popover body. Receives a `close` callback to dismiss after a selection. */
  children: (close: () => void) => ReactNode;
}

/** A button that toggles an absolutely-positioned popover, closing on outside
 *  click via a transparent full-screen backdrop. */
export function Dropdown({
  label,
  placeholder = false,
  disabled = false,
  ariaLabel,
  wide = false,
  children,
}: DropdownProps): ReactElement {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  return (
    <div className={controls.dropdown}>
      <button
        type="button"
        className={controls.trigger}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={placeholder ? controls.triggerPlaceholder : undefined}>{label}</span>
        <svg
          className={controls.chevron}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <button type="button" className={controls.backdrop} aria-hidden="true" onClick={close} />
          <div className={`${controls.popover} ${wide ? controls.popoverWide : ''}`} role="listbox">
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
