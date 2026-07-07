import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ScheduleIcon } from '@/shared/ui/icons/ScheduleIcon';
import { useScheduledWeekBuild } from '@/pages/AssistantPage/domain/assistant/hooks/useScheduledWeekBuild';
import sidebarStyles from '../../view/AssistantSidebar.module.css';
import styles from './ScheduleWeekBuildMenu.module.css';

/** Local `datetime-local` value at least a minute in the future, for the input's `min`. */
function minLocalValue(): string {
  const d = new Date(Date.now() + 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatScheduledFor(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Icon button + popover: schedule (or cancel) the "plan next week" build, à la Claude Code's scheduled tasks. */
export function ScheduleWeekBuildMenu(): ReactElement {
  const [open, setOpen] = useState(false);
  const [datetime, setDatetime] = useState(minLocalValue());
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { pending, status, error, refresh, schedule, cancel } = useScheduledWeekBuild();

  useEffect(() => {
    if (!open) {
      return;
    }
    if (status === 'idle') {
      refresh();
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
  }, [open, status, refresh]);

  async function handleSchedule(): Promise<void> {
    setSubmitting(true);
    try {
      await schedule(new Date(datetime).toISOString());
    } catch {
      // surfaced via the hook's `error` state
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(): Promise<void> {
    setSubmitting(true);
    try {
      await cancel();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={sidebarStyles.iconButton}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Schedule next week's build"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip="Schedule next week's build"
      >
        <ScheduleIcon />
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Plan next week">
          <p className={styles.title}>Plan next week</p>
          {status === 'loading' && <p className={styles.hint}>Loading…</p>}
          {status !== 'loading' && pending && (
            <>
              <p className={styles.summary}>
                Week {pending.targetWeekIndex + 1} planning
                <br />
                <span className={styles.summaryDate}>{formatScheduledFor(pending.scheduledForUtc)}</span>
              </p>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </button>
            </>
          )}
          {status !== 'loading' && !pending && (
            <>
              <p className={styles.hint}>
                Automatically open a new planning chat and start next week's build.
              </p>
              <input
                type="datetime-local"
                className={styles.input}
                value={datetime}
                min={minLocalValue()}
                onChange={(e) => setDatetime(e.target.value)}
              />
              <button
                type="button"
                className={styles.scheduleButton}
                onClick={handleSchedule}
                disabled={submitting}
              >
                Schedule
              </button>
            </>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </div>
  );
}
