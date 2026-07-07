import type { ReactElement } from 'react';
import controls from '../controls.module.css';

interface NumberStepperProps {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled?: boolean;
  ariaLabel: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A −/value/+ numeric control with a unit suffix. Value is a controlled string
 *  (parsed by the caller); the buttons and blur snap it into [min, max]. */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  ariaLabel,
}: NumberStepperProps): ReactElement {
  const current = Number(value);
  const base = Number.isFinite(current) && value.trim() !== '' ? current : min;

  const bump = (delta: number): void => {
    onChange(String(clamp(base + delta, min, max)));
  };

  return (
    <div className={controls.numStepper}>
      <button
        type="button"
        className={controls.stepBtn}
        onClick={() => bump(-step)}
        disabled={disabled || base <= min}
        aria-label={`Decrease ${ariaLabel}`}
      >
        −
      </button>
      <input
        className={controls.numInput}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const n = Number(e.target.value);
          onChange(String(Number.isFinite(n) && e.target.value.trim() !== '' ? clamp(n, min, max) : min));
        }}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span className={controls.unit}>{unit}</span>
      <button
        type="button"
        className={controls.stepBtn}
        onClick={() => bump(step)}
        disabled={disabled || base >= max}
        aria-label={`Increase ${ariaLabel}`}
      >
        +
      </button>
    </div>
  );
}
