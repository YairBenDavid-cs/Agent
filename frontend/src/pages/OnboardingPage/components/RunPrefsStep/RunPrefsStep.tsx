import type { ReactElement } from 'react';
import type { ExperienceLevel, RunType } from '../../domain/types';
import type { RunDraft } from '../../state/onboardingDraft';
import { toggleValue } from '../OptionChips/toggleValue';
import { NumberStepper } from '../NumberStepper/NumberStepper';
import controls from '../controls.module.css';

const RUN_TYPES: { value: RunType; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'fartlek', label: 'Fartlek' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'long', label: 'Long' },
  { value: 'recovery', label: 'Recovery' },
];

const LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

interface RunPrefsStepProps {
  value: RunDraft;
  onChange: (patch: Partial<RunDraft>) => void;
  disabled: boolean;
}

export function RunPrefsStep({ value, onChange, disabled }: RunPrefsStepProps): ReactElement {
  return (
    <div className={controls.stack}>
      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Current weekly volume</p>
          <p className={controls.sectionSub}>Roughly how far do you run in a week now?</p>
        </div>
        <NumberStepper
          ariaLabel="current weekly volume in kilometres"
          value={value.weeklyKm}
          onChange={(weeklyKm) => onChange({ weeklyKm })}
          min={0}
          max={300}
          step={5}
          unit="km / wk"
          disabled={disabled}
        />
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Runs you enjoy</p>
          <p className={controls.sectionSub}>Pick any that apply.</p>
        </div>
        <div className={controls.pillWrap} role="group">
          {RUN_TYPES.map((type) => {
            const active = value.likedRunTypes.includes(type.value);
            return (
              <button
                key={type.value}
                type="button"
                aria-pressed={active}
                className={`${controls.pill} ${active ? controls.pillSelected : ''}`}
                onClick={() =>
                  onChange({ likedRunTypes: toggleValue(value.likedRunTypes, type.value) })
                }
                disabled={disabled}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Experience level</p>
        </div>
        <div className={`${controls.chipGrid} ${controls.cols3}`} role="radiogroup">
          {LEVELS.map((level) => {
            const active = value.experienceLevel === level.value;
            return (
              <button
                key={level.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`${controls.chip} ${active ? controls.chipSelected : ''}`}
                onClick={() => onChange({ experienceLevel: level.value })}
                disabled={disabled}
              >
                {level.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
