import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { ScheduleIcon } from '@/shared/ui/icons/ScheduleIcon';
import { useScheduledWeekBuild } from '@/pages/AssistantPage/domain/assistant/hooks/useScheduledWeekBuild';
import { useGarminSyncSchedule } from '@/pages/AssistantPage/domain/garmin/useGarminSyncSchedule';
import type { GarminSyncMode } from '@/pages/OnboardingPage/api/connections';
import sidebarStyles from '../../view/AssistantSidebar.module.css';
import styles from './RoutinesMenu.module.css';

const MAX_TIMES = 3;
const DEFAULT_NEW_TIME = '12:00';

const MODE_HINT: Record<GarminSyncMode, string> = {
  plan: "When data changes something, I'll open a chat with the recommendation and wait for your call.",
  auto: "I'll apply recovery-based adjustments to your plan automatically and log what changed.",
};

/** Local `datetime-local` value at least a minute in the future, for the input's `min`. */
function minLocalValue(): string {
  const d = new Date(Date.now() + 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** UTC ISO string → the `datetime-local` value for the user's local zone. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
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

interface RoutinesMenuProps {
  /** Whether the user has Garmin connected — gates the sync-schedule card. */
  garminVisible: boolean;
  /** Small transient confirmation, e.g. after scheduling a build or saving routines. */
  onToast: (message: string) => void;
}

/**
 * Icon button + centered modal for the assistant's "Routines" — the automations
 * that run without you asking: the one-off "plan next week" build and the
 * recurring Garmin sync (up to 3x/day, Plan vs Auto mode). Saving persists the
 * Garmin schedule + the plan on/off state, closes the modal, and fires a toast.
 */
export function RoutinesMenu({ garminVisible, onToast }: RoutinesMenuProps): ReactElement {
  const [open, setOpen] = useState(false);

  const [planEnabled, setPlanEnabled] = useState(true);
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
  const [garminEnabled, setGarminEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
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
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, weekStatus, refreshWeek, garminVisible, garminStatus, refreshGarmin]);

  // Reflect an already-scheduled build: prefill the time and flip the toggle on.
  useEffect(() => {
    if (pending) {
      setDatetime(toLocalInputValue(pending.scheduledForUtc));
      setPlanEnabled(true);
    }
  }, [pending]);

  useEffect(() => {
    if (garminSchedule) {
      setTimes(garminSchedule.syncTimesLocal);
      setMode(garminSchedule.mode);
      setGarminEnabled(garminSchedule.enabled);
    }
  }, [garminSchedule]);

  async function handleScheduleWeek(): Promise<void> {
    const chosen = new Date(datetime);
    // The datetime-local value is only set on mount / by hand — if the modal sat
    // open a while, "now + 1 min" can quietly drift into the past. Catch that
    // here with a fresh default instead of a raw backend validation error.
    if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
      setDatetime(minLocalValue());
      onToast('That time has already passed — pick a later time and try again.');
      return;
    }
    // Capture before the async calls null `pending` out, so the toast can say
    // "rescheduled" vs "scheduled".
    const wasPending = Boolean(pending);
    setWeekSubmitting(true);
    try {
      // There's no update endpoint and no uniqueness guard server-side — a second
      // POST while one is pending creates a duplicate that would fire twice. So
      // rescheduling means cancel the existing pending build, then create anew.
      if (pending) {
        await cancelWeek();
      }
      const scheduledForUtc = chosen.toISOString();
      await scheduleWeek(scheduledForUtc);
      onToast(
        `Next week's build is ${wasPending ? 'rescheduled' : 'scheduled'} for ${formatScheduledFor(scheduledForUtc)}.`,
      );
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

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      if (garminVisible) {
        await saveGarmin({ syncTimesLocal: times, mode, enabled: garminEnabled });
      }
      // Turning the plan routine off cancels any pending build (the "plan
      // toggle" the footer Save is responsible for; scheduling itself stays on
      // the dedicated "Schedule next build" button).
      if (!planEnabled && pending) {
        await cancelWeek();
      }
      setOpen(false);
      onToast('Routines saved.');
    } catch {
      // leave the modal open; the failing hook's `error` state is rendered inline
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={sidebarStyles.iconButton}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Routines"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip="Routines"
      >
        <ScheduleIcon />
      </button>

      {open && (
        <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
          <div
            className={styles.card}
            role="dialog"
            aria-modal="true"
            aria-label="Routines"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerIcon}>
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 1.5" />
                  <path d="M5 3 2 6" />
                  <path d="m22 6-3-3" />
                </svg>
              </div>
              <div className={styles.headerText}>
                <p className={styles.headerTitle}>Routines</p>
                <p className={styles.headerSubtitle}>Automations that run for you</p>
              </div>
            </div>

            <div className={styles.body}>
              {/* Plan next week */}
              <div className={`${styles.routineCard} ${styles.routineCardHighlight}`}>
                <span className={styles.cardGlow} />
                <div className={styles.cardHead}>
                  <div className={`${styles.cardIcon} ${styles.cardIconAccent}`}>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#f28a4c"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M8 2v4M16 2v4M3 10h18" />
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="m9 16 2 2 4-4" />
                    </svg>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitleRow}>
                      <p className={styles.cardTitle}>Plan next week</p>
                      <span className={styles.badge}>Weekly</span>
                    </div>
                    <p className={styles.cardDesc}>
                      Opens a fresh planning chat and kicks off next week's build automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.switch} ${planEnabled ? styles.switchOn : ''}`}
                    onClick={() => setPlanEnabled((prev) => !prev)}
                    role="switch"
                    aria-checked={planEnabled}
                    aria-label="Enable weekly planning"
                  >
                    <span className={`${styles.knob} ${planEnabled ? styles.knobOn : ''}`} />
                  </button>
                </div>

                {planEnabled && (
                  <>
                    {weekStatus === 'loading' && <p className={styles.loading}>Loading…</p>}
                    {weekStatus !== 'loading' && (
                      <>
                        <div className={styles.whenRow}>
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#8b847a"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          <input
                            type="datetime-local"
                            className={styles.whenInput}
                            value={datetime}
                            min={minLocalValue()}
                            onChange={(e) => setDatetime(e.target.value)}
                          />
                          <span className={styles.whenLabel}>next run</span>
                        </div>
                        <button
                          type="button"
                          className={styles.scheduleButton}
                          onClick={handleScheduleWeek}
                          disabled={weekSubmitting}
                        >
                          {pending ? 'Reschedule next build' : 'Schedule next build'}
                        </button>
                      </>
                    )}
                    {weekError && <p className={styles.error}>{weekError}</p>}
                  </>
                )}
              </div>

              {/* Garmin sync */}
              {garminVisible && (
                <div className={styles.routineCard}>
                  <div className={styles.cardHead}>
                    <div className={`${styles.cardIcon} ${styles.cardIconMuted}`}>
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#c7c0b6"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 12a9 9 0 1 1-9-9" />
                        <path d="M21 3v6h-6" />
                        <path d="M12 8v4l2.5 1.5" />
                      </svg>
                    </div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>Garmin sync</p>
                      <p className={styles.cardDesc}>
                        Pull fresh training &amp; recovery data at set times each day.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`${styles.switch} ${garminEnabled ? styles.switchOn : ''}`}
                      onClick={() => setGarminEnabled((prev) => !prev)}
                      role="switch"
                      aria-checked={garminEnabled}
                      aria-label="Enable Garmin sync"
                    >
                      <span className={`${styles.knob} ${garminEnabled ? styles.knobOn : ''}`} />
                    </button>
                  </div>

                  {garminStatus === 'loading' && <p className={styles.loading}>Loading…</p>}
                  {garminStatus !== 'loading' && garminEnabled && (
                    <div className={styles.expanded}>
                      <p className={styles.sectionLabel}>Sync times</p>
                      <div className={styles.times}>
                        {times.map((time, index) => (
                          <div key={index} className={styles.timeRow}>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#7d766c"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="9" />
                              <path d="M12 7v5l3 2" />
                            </svg>
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
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {times.length < MAX_TIMES && (
                        <button type="button" className={styles.addButton} onClick={addTime}>
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          Add sync time
                        </button>
                      )}

                      <p className={`${styles.sectionLabel} ${styles.sectionLabelSpaced}`}>On sync</p>
                      <div className={styles.segmented}>
                        <button
                          type="button"
                          className={`${styles.segButton} ${mode === 'plan' ? styles.segButtonActive : ''}`}
                          onClick={() => setMode('plan')}
                        >
                          Plan &amp; wait
                        </button>
                        <button
                          type="button"
                          className={`${styles.segButton} ${mode === 'auto' ? styles.segButtonActive : ''}`}
                          onClick={() => setMode('auto')}
                        >
                          Auto-apply
                        </button>
                      </div>
                      <div className={styles.modeNote}>
                        <svg
                          className={styles.modeNoteIcon}
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#e8894f"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 8h.01M11 12h1v4h1" />
                        </svg>
                        <p className={styles.modeNoteText}>{MODE_HINT[mode]}</p>
                      </div>
                    </div>
                  )}
                  {garminError && <p className={styles.error}>{garminError}</p>}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <button type="button" className={styles.cancelButton} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save routines'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
