import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { SettingsIcon } from '@/shared/ui/icons/SettingsIcon';
import styles from './SettingsMenu.module.css';

export function SettingsMenu(): ReactElement {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleLogout(): void {
    setOpen(false);
    logout();
    navigate('/auth', { replace: true });
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" className={styles.menuItem} role="menuitem" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SettingsIcon className={styles.icon} />
      </button>
    </div>
  );
}
