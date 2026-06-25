import type { ReactElement } from 'react';
import type { ExperienceLevel, RunType } from '../../domain/types';
import type { RunDraft } from '../../state/onboardingDraft';
import { Field } from '../Field/Field';
import { OptionGroup, type ChipOption } from '../OptionChips/OptionGroup';
import { OptionToggleGroup } from '../OptionChips/OptionToggleGroup';
import { toggleValue } from '../OptionChips/toggleValue';
import section from '../stepSection.module.css';

const RUN_TYPES: ChipOption<RunType>[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'fartlek', label: 'Fartlek' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'long', label: 'Long' },
  { value: 'recovery', label: 'Recovery' },
];

const LEVELS: ChipOption<ExperienceLevel>[] = [
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
    <div className={section.stack}>
      <Field
        label="Current weekly volume (km)"
        type="number"
        value={value.weeklyKm}
        onChange={(weeklyKm) => onChange({ weeklyKm })}
        min={0}
        disabled={disabled}
      />
      <div className={section.section}>
        <p className={section.sectionTitle}>Runs you enjoy</p>
        <OptionToggleGroup
          options={RUN_TYPES}
          values={value.likedRunTypes}
          onToggle={(type) => onChange({ likedRunTypes: toggleValue(value.likedRunTypes, type) })}
          disabled={disabled}
        />
      </div>
      <div className={section.section}>
        <p className={section.sectionTitle}>Experience level (optional)</p>
        <OptionGroup
          options={LEVELS}
          value={value.experienceLevel === '' ? null : value.experienceLevel}
          onChange={(experienceLevel) => onChange({ experienceLevel })}
          disabled={disabled}
        />
      </div>
      <div className={section.row}>
        <Field
          label="Longest recent run (km)"
          type="number"
          value={value.longestRecentKm}
          onChange={(longestRecentKm) => onChange({ longestRecentKm })}
          optional
          min={0}
          disabled={disabled}
        />
        <Field
          label="Target race"
          value={value.targetRace}
          onChange={(targetRace) => onChange({ targetRace })}
          placeholder="e.g. 10k, half, marathon"
          optional
          disabled={disabled}
        />
      </div>
      <Field
        label="Recent 5k time"
        value={value.recent5kTime}
        onChange={(recent5kTime) => onChange({ recent5kTime })}
        placeholder="HH:mm:ss"
        optional
        disabled={disabled}
      />
    </div>
  );
}
