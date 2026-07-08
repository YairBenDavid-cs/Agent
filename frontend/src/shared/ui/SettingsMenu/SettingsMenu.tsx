import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/auth/useAuth';
import { SettingsIcon } from '@/shared/ui/icons/SettingsIcon';
import { fetchUserSettings, updateAutoModeOptIn } from '@/shared/api/userSettingsApi';
import styles from './SettingsMenu.module.css';

export function SettingsMenu(): ReactElement {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [autoModeOptIn, setAutoModeOptIn] = useState(false);
  const [autoModePending, setAutoModePending] = useState(false);

  // Load the current setting lazily, once, the first time the menu opens —
  // no page mounts this component with the setting already needed elsewhere.
  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    fetchUserSettings()
      .then((settings) => {
        if (active) setAutoModeOptIn(settings.autoModeOptIn);
      })
      .catch(() => {
        // Leave the last-known value; the toggle still works optimistically.
      });
    return () => {
      active = false;
    };
  }, [open]);

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

  function handleToggleAutoMode(): void {
    const next = !autoModeOptIn;
    setAutoModeOptIn(next);
    setAutoModePending(true);
    updateAutoModeOptIn(next)
      .catch(() => {
        // Roll back on failure — the server's value is the source of truth.
        setAutoModeOptIn(!next);
      })
      .finally(() => setAutoModePending(false));
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.menuItem}
            role="menuitemcheckbox"
            aria-checked={autoModeOptIn}
            disabled={autoModePending}
            onClick={handleToggleAutoMode}
          >
            <span className={styles.menuItemLabel}>Auto Mode</span>
            <span className={autoModeOptIn ? styles.toggleOn : styles.toggleOff} aria-hidden="true">
              <span className={styles.toggleKnob} />
            </span>
          </button>
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
