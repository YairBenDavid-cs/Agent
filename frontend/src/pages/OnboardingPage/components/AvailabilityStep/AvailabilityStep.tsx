import type { ReactElement } from 'react';
import type { AvailabilitySlot } from '../../domain/types';
import { Field } from '../Field/Field';
import { SlotRow } from './components/SlotRow/SlotRow';
import section from '../stepSection.module.css';
import styles from './AvailabilityStep.module.css';

const MAX_SLOTS = 21;

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
  function updateSlot(index: number, patch: Partial<AvailabilitySlot>): void {
    onSlotsChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(index: number): void {
    onSlotsChange(slots.filter((_, i) => i !== index));
  }

  function addSlot(): void {
    if (slots.length >= MAX_SLOTS) {
      return;
    }
    onSlotsChange([...slots, { day: 'mon', startTime: '07:00', endTime: '08:00' }]);
  }

  return (
    <div className={section.stack}>
      <div className={section.section}>
        <p className={section.sectionTitle}>Weekly availability</p>
        <div className={styles.slots}>
          {slots.map((slot, index) => (
            <SlotRow
              key={index}
              slot={slot}
              onChange={(patch) => updateSlot(index, patch)}
              onRemove={() => removeSlot(index)}
              canRemove={slots.length > 1}
              disabled={disabled}
            />
          ))}
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={addSlot}
          disabled={disabled || slots.length >= MAX_SLOTS}
        >
          + Add another window
        </button>
      </div>
      <Field
        label="Typical session length (minutes)"
        type="number"
        value={String(sessionDurationMin)}
        onChange={(value) => onDurationChange(Number(value))}
        min={10}
        max={300}
        step={5}
        disabled={disabled}
      />
    </div>
  );
}
