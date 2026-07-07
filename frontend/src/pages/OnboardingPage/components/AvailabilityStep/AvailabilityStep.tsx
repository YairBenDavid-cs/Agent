import { useEffect, useRef, type ReactElement } from 'react';
import type { AvailabilitySlot, WeekDay } from '../../domain/types';
import {
  HOUR_START,
  SLOT_COUNT,
  WEEK_DAYS,
  activeDayCount,
  shortHour,
  slotRangeLabel,
  slotsToGrid,
  toggleCell,
  totalHours,
} from '../../domain/availabilityGrid';
import controls from '../controls.module.css';
import styles from './AvailabilityStep.module.css';

const DAY_LABELS: Record<WeekDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const SESSION_OPTIONS = [30, 45, 60, 75, 90, 120];

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  return `${hours} hr`;
}

interface AvailabilityStepProps {
  slots: AvailabilitySlot[];
  sessionDurationMin: number;
  onSlotsChange: (slots: AvailabilitySlot[]) => void;
  onDurationChange: (minutes: number) => void;
  disabled: boolean;
}

export function AvailabilityStep({
  slots,
  sessionDurationMin,
  onSlotsChange,
  onDurationChange,
  disabled,
}: AvailabilityStepProps): ReactElement {
  const grid = slotsToGrid(slots);
  // Drag-to-paint bookkeeping. `slotsRef` always holds the latest slots so
  // rapid pointerenter events compose correctly between renders.
  const dragging = useRef(false);
  const paintOn = useRef(true);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useEffect(() => {
    const stop = (): void => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const paint = (day: WeekDay, cell: number): void => {
    onSlotsChange(toggleCell(slotsRef.current, day, cell, paintOn.current));
  };

  const startPaint = (day: WeekDay, cell: number): void => {
    if (disabled) {
      return;
    }
    dragging.current = true;
    paintOn.current = !grid[day].has(cell);
    paint(day, cell);
  };

  const activeDays = WEEK_DAYS.filter(({ key }) => grid[key].size > 0);
  const days = activeDayCount(slots);
  const hours = totalHours(slots);

  return (
    <div className={controls.stack}>
      <div className={controls.card}>
        <div className={controls.cardHeadRow}>
          <div className={controls.sectionHead}>
            <p className={controls.sectionTitle}>Map your typical week</p>
            <p className={controls.sectionSub}>
              Tap or drag across the times you can usually train.
            </p>
          </div>
          {hours > 0 && (
            <span className={controls.accentStat}>
              {days} {days === 1 ? 'day' : 'days'} · {hours} hrs / wk
            </span>
          )}
        </div>

        <div className={styles.gridScroll}>
          <div className={styles.grid}>
            <div className={styles.scaleRow} aria-hidden="true">
              <span className={styles.scaleSpacer} />
              <span className={styles.scaleCells}>
                {Array.from({ length: SLOT_COUNT }, (_, i) => (
                  <span key={i} className={styles.scaleLabel}>
                    {i % 3 === 0 ? shortHour(HOUR_START + i) : ''}
                  </span>
                ))}
              </span>
              <span className={styles.scaleSpacerRight} />
            </div>

            {WEEK_DAYS.map(({ key, short }) => (
              <div key={key} className={styles.dayRow}>
                <span className={styles.dayName}>{short}</span>
                <div className={styles.cells}>
                  {Array.from({ length: SLOT_COUNT }, (_, i) => {
                    const on = grid[key].has(i);
                    return (
                      <div
                        key={i}
                        role="button"
                        aria-pressed={on}
                        aria-label={`${DAY_LABELS[key]} ${shortHour(HOUR_START + i)}`}
                        className={`${styles.cell} ${on ? styles.cellOn : ''}`}
                        onPointerDown={() => startPaint(key, i)}
                        onPointerEnter={() => {
                          if (dragging.current) {
                            paint(key, i);
                          }
                        }}
                      />
                    );
                  })}
                </div>
                <span className={styles.hourCount}>{grid[key].size > 0 ? `${grid[key].size}h` : ''}</span>
              </div>
            ))}
          </div>
        </div>

        {hours === 0 ? (
          <div className={styles.empty}>Select the blocks when you can usually train.</div>
        ) : (
          <div className={styles.summary}>
            {activeDays.map(({ key }) => {
              const ranges = slots
                .filter((s) => s.day === key)
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map(slotRangeLabel);
              return (
                <div key={key} className={styles.summaryRow}>
                  <span className={styles.summaryDay}>{DAY_LABELS[key]}</span>
                  <span className={styles.summaryTimes}>{ranges.join(', ')}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Typical session length</p>
          <p className={controls.sectionSub}>Roughly how long is one workout?</p>
        </div>
        <div className={controls.pillWrap}>
          {SESSION_OPTIONS.map((minutes) => {
            const active = minutes === sessionDurationMin;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={active}
                className={`${controls.pill} ${active ? controls.pillSelected : ''}`}
                onClick={() => onDurationChange(minutes)}
                disabled={disabled}
              >
                {formatDuration(minutes)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
