import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ScheduleIcon } from '@/shared/ui/icons/ScheduleIcon';
import { useScheduledWeekBuild } from '@/pages/AssistantPage/domain/assistant/hooks/useScheduledWeekBuild';
import { useGarminSyncSchedule } from '@/pages/AssistantPage/domain/garmin/useGarminSyncSchedule';
import type { GarminSyncMode } from '@/pages/OnboardingPage/api/connections';
import sidebarStyles from '../../view/AssistantSidebar.module.css';
import styles from './ScheduleMenu.module.css';

const MAX_TIMES = 3;
const DEFAULT_NEW_TIME = '08:00';

const MODE_HINT: Record<GarminSyncMode, string> = {
  plan: "Recovery or session data changes something? I'll open a chat with the recommendation and wait for you.",
  auto: "Recovery or session data changes something? I'll apply it, then open a chat explaining what changed.",
};

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

interface ScheduleMenuProps {
  /** Whether the user has Garmin connected — gates the sync-schedule section. */
  garminVisible: boolean;
  /** Small transient confirmation, e.g. after scheduling a build or saving a sync schedule. */
  onToast: (message: string) => void;
}

/**
 * Icon button + popover combining the two recurring/scheduled things the assistant
 * manages: the one-off "plan next week" build, and the recurring Garmin sync (up to
 * 3x/day, Plan vs Auto mode). Both are "things that happen on a schedule without you
 * asking", so they live behind one icon instead of two.
 */
export function ScheduleMenu({ garminVisible, onToast }: ScheduleMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [datetime, setDatetime] = useState(minLocalValue());
  const [weekSubmitting, setWeekSubmitting] = useState(false);
  const {
    pending,
    status: weekStatus,
    error: weekError,
    refresh: refreshWeek,
    schedule: scheduleWeek,
    cancel: cancelWeek,
  } = useScheduledWeekBuild();

  const [times, setTimes] = useState<string[]>([]);
  const [mode, setMode] = useState<GarminSyncMode>('plan');
  const [enabled, setEnabled] = useState(true);
  const [garminSubmitting, setGarminSubmitting] = useState(false);
  const {
    schedule: garminSchedule,
    status: garminStatus,
    error: garminError,
    refresh: refreshGarmin,
    save: saveGarmin,
  } = useGarminSyncSchedule();

  useEffect(() => {
    if (!open) {
      return;
    }
    if (weekStatus === 'idle') {
      refreshWeek();
    }
    if (garminVisible && garminStatus === 'idle') {
      refreshGarmin();
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
  }, [open, weekStatus, refreshWeek, garminVisible, garminStatus, refreshGarmin]);

  useEffect(() => {
    if (garminSchedule) {
      setTimes(garminSchedule.syncTimesLocal);
      setMode(garminSchedule.mode);
      setEnabled(garminSchedule.enabled);
    }
  }, [garminSchedule]);

  async function handleScheduleWeek(): Promise<void> {
    const chosen = new Date(datetime);
    // The datetime-local input's value is only ever set once (on mount or by
    // hand) — if the popover sat open a while, or the field was never
    // touched, "now + 1 min" can have quietly drifted into the past by the
    // time Schedule is clicked. Catch that here with a fresh default instead
    // of bouncing the user off a raw backend validation error.
    if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
      setDatetime(minLocalValue());
      onToast('That time has already passed — pick a later time and try again.');
      return;
    }
    setWeekSubmitting(true);
    try {
      const scheduledForUtc = chosen.toISOString();
      await scheduleWeek(scheduledForUtc);
      onToast(`Next week's build is scheduled for ${formatScheduledFor(scheduledForUtc)}.`);
    } catch {
      // surfaced via the hook's `error` state
    } finally {
      setWeekSubmitting(false);
    }
  }

  async function handleCancelWeek(): Promise<void> {
    setWeekSubmitting(true);
    try {
      await cancelWeek();
      onToast('Scheduled build canceled.');
    } catch {
      // surfaced via the hook's `error` state
    } finally {
      setWeekSubmitting(false);
    }
  }

  function updateTime(index: number, value: string): void {
    setTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeTime(index: number): void {
    setTimes((prev) => prev.filter((_, i) => i !== index));
  }

  function addTime(): void {
    setTimes((prev) => (prev.length >= MAX_TIMES ? prev : [...prev, DEFAULT_NEW_TIME]));
  }

  async function handleSaveGarmin(): Promise<void> {
    setGarminSubmitting(true);
    try {
      await saveGarmin({ syncTimesLocal: times, mode, enabled });
      onToast(
        enabled
          ? `Garmin sync schedule saved (${mode === 'auto' ? 'Auto' : 'Plan'} mode).`
          : 'Garmin sync schedule saved (disabled).',
      );
    } catch {
      // surfaced via the hook's `error` state
    } finally {
      setGarminSubmitting(false);
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={sidebarStyles.iconButton}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Schedule"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip="Schedule"
      >
        <ScheduleIcon />
      </button>
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Schedule">
          <section>
            <p className={styles.title}>Plan next week</p>
            {weekStatus === 'loading' && <p className={styles.hint}>Loading…</p>}
            {weekStatus !== 'loading' && pending && (
              <>
                <p className={styles.summary}>
                  Week {pending.targetWeekIndex + 1} planning
                  <br />
                  <span className={styles.summaryDate}>{formatScheduledFor(pending.scheduledForUtc)}</span>
                </p>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancelWeek}
                  disabled={weekSubmitting}
                >
                  Cancel
                </button>
              </>
            )}
            {weekStatus !== 'loading' && !pending && (
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
                  onClick={handleScheduleWeek}
                  disabled={weekSubmitting}
                >
                  Schedule
                </button>
              </>
            )}
            {weekError && <p className={styles.error}>{weekError}</p>}
          </section>

          {garminVisible && (
            <>
              <div className={styles.divider} />
              <section>
                <p className={styles.title}>Garmin sync schedule</p>
                {garminStatus === 'loading' && <p className={styles.hint}>Loading…</p>}
                {garminStatus !== 'loading' && (
                  <>
                    <label className={styles.enabledRow}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                      />
                      Enabled
                    </label>

                    <div className={styles.times}>
                      {times.map((time, index) => (
                        <div key={index} className={styles.timeRow}>
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={time}
                            onChange={(e) => updateTime(index, e.target.value)}
                          />
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => removeTime(index)}
                            aria-label="Remove this sync time"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {times.length < MAX_TIMES && (
                        <button type="button" className={styles.addButton} onClick={addTime}>
                          + Add time
                        </button>
                      )}
                    </div>

                    <div className={styles.modeRow}>
                      {(['plan', 'auto'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={m === mode ? styles.modeButtonActive : styles.modeButton}
                          onClick={() => setMode(m)}
                        >
                          {m === 'plan' ? 'Plan' : 'Auto'}
                        </button>
                      ))}
                    </div>
                    <p className={styles.hint}>{MODE_HINT[mode]}</p>

                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={handleSaveGarmin}
                      disabled={garminSubmitting || times.length === 0}
                    >
                      Save
                    </button>
                  </>
                )}
                {garminError && <p className={styles.error}>{garminError}</p>}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
