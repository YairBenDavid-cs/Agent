import type { ReactElement } from 'react';
import type { AvailabilitySlot, WeekDay } from '../../../../domain/types';
import { isValidSlot } from '../../../../domain/validation';
import styles from '../../AvailabilityStep.module.css';

const DAYS: { value: WeekDay; label: string }[] = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

interface SlotRowProps {
  slot: AvailabilitySlot;
  onChange: (patch: Partial<AvailabilitySlot>) => void;
  onRemove: () => void;
  canRemove: boolean;
  disabled: boolean;
}

export function SlotRow({
  slot,
  onChange,
  onRemove,
  canRemove,
  disabled,
}: SlotRowProps): ReactElement {
  const invalid = !isValidSlot(slot.startTime, slot.endTime);
  return (
    <div>
      <div className={styles.slotRow}>
        <label className={styles.control}>
          <span className={styles.controlLabel}>Day</span>
          <select
            className={styles.select}
            value={slot.day}
            onChange={(event) => onChange({ day: event.target.value as WeekDay })}
            disabled={disabled}
          >
            {DAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.control}>
          <span className={styles.controlLabel}>From</span>
          <input
            className={styles.time}
            type="time"
            value={slot.startTime}
            onChange={(event) => onChange({ startTime: event.target.value })}
            disabled={disabled}
          />
        </label>
        <label className={styles.control}>
          <span className={styles.controlLabel}>To</span>
          <input
            className={styles.time}
            type="time"
            value={slot.endTime}
            onChange={(event) => onChange({ endTime: event.target.value })}
            disabled={disabled}
          />
        </label>
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label="Remove window"
          title="Remove window"
        >
          ×
        </button>
      </div>
      {invalid && <p className={styles.warning}>End time must be after the start time.</p>}
    </div>
  );
}
