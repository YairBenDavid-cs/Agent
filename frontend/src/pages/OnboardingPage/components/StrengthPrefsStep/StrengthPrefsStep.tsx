import type { ReactElement } from 'react';
import type {
  Equipment,
  ExperienceLevel,
  MuscleGroup,
  SplitPreference,
} from '../../domain/types';
import type { StrengthDraft } from '../../state/onboardingDraft';
import { Field } from '../Field/Field';
import { OptionGroup, type ChipOption } from '../OptionChips/OptionGroup';
import { OptionToggleGroup } from '../OptionChips/OptionToggleGroup';
import { toggleValue } from '../OptionChips/toggleValue';
import section from '../stepSection.module.css';

const MUSCLE_GROUPS: ChipOption<MuscleGroup>[] = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'legs', label: 'Legs' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Full body' },
];

const EQUIPMENT: ChipOption<Equipment>[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'machines', label: 'Machines' },
  { value: 'resistance_bands', label: 'Resistance bands' },
  { value: 'cables', label: 'Cables' },
  { value: 'pullup_bar', label: 'Pull-up bar' },
];

const LEVELS: ChipOption<ExperienceLevel>[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const SPLITS: ChipOption<SplitPreference>[] = [
  { value: 'full_body', label: 'Full body' },
  { value: 'upper_lower', label: 'Upper / lower' },
  { value: 'push_pull_legs', label: 'Push / pull / legs' },
  { value: 'bro_split', label: 'Bro split' },
];

interface StrengthPrefsStepProps {
  value: StrengthDraft;
  onChange: (patch: Partial<StrengthDraft>) => void;
  disabled: boolean;
}

export function StrengthPrefsStep({
  value,
  onChange,
  disabled,
}: StrengthPrefsStepProps): ReactElement {
  return (
    <div className={section.stack}>
      <div className={section.section}>
        <p className={section.sectionTitle}>Target muscle groups</p>
        <OptionToggleGroup
          options={MUSCLE_GROUPS}
          values={value.targetMuscleGroups}
          onToggle={(group) =>
            onChange({ targetMuscleGroups: toggleValue(value.targetMuscleGroups, group) })
          }
          disabled={disabled}
        />
      </div>
      <div className={section.section}>
        <p className={section.sectionTitle}>Available equipment</p>
        <OptionToggleGroup
          options={EQUIPMENT}
          values={value.equipment}
          onToggle={(item) => onChange({ equipment: toggleValue(value.equipment, item) })}
          disabled={disabled}
        />
      </div>
      <div className={section.row}>
        <Field
          label="Exercises / session"
          type="number"
          value={value.exercisesPerSession}
          onChange={(exercisesPerSession) => onChange({ exercisesPerSession })}
          min={1}
          max={50}
          disabled={disabled}
        />
        <Field
          label="Sets / exercise"
          type="number"
          value={value.setsPerExercise}
          onChange={(setsPerExercise) => onChange({ setsPerExercise })}
          min={1}
          max={20}
          disabled={disabled}
        />
        <Field
          label="Reps / exercise"
          type="number"
          value={value.repsPerExercise}
          onChange={(repsPerExercise) => onChange({ repsPerExercise })}
          min={1}
          max={100}
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
      <div className={section.section}>
        <p className={section.sectionTitle}>Preferred split (optional)</p>
        <OptionGroup
          options={SPLITS}
          value={value.splitPreference === '' ? null : value.splitPreference}
          onChange={(splitPreference) => onChange({ splitPreference })}
          disabled={disabled}
        />
      </div>
      <Field
        label="Favourite exercises (comma-separated)"
        value={value.preferredExercises}
        onChange={(preferredExercises) => onChange({ preferredExercises })}
        placeholder="e.g. squat, bench press, deadlift"
        optional
        maxLength={800}
        disabled={disabled}
      />
    </div>
  );
}
