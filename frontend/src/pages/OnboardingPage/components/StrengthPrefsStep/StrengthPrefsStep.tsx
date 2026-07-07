import type { ReactElement } from 'react';
import type {
  Equipment,
  ExperienceLevel,
  MuscleGroup,
  SplitPreference,
} from '../../domain/types';
import type { StrengthDraft } from '../../state/onboardingDraft';
import { toggleValue } from '../OptionChips/toggleValue';
import { NumberStepper } from '../NumberStepper/NumberStepper';
import controls from '../controls.module.css';
import styles from './StrengthPrefsStep.module.css';

const MUSCLE_GROUPS: { value: MuscleGroup; label: string }[] = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'legs', label: 'Legs' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Full body' },
];

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'machines', label: 'Machines' },
  { value: 'resistance_bands', label: 'Resistance bands' },
  { value: 'cables', label: 'Cables' },
  { value: 'pullup_bar', label: 'Pull-up bar' },
];

const LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const SPLITS: { value: SplitPreference; label: string }[] = [
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
  const pills = <T extends string>(
    options: { value: T; label: string }[],
    selected: T[],
    toggle: (value: T) => void,
  ): ReactElement => (
    <div className={controls.pillWrap} role="group">
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`${controls.pill} ${active ? controls.pillSelected : ''}`}
            onClick={() => toggle(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const chips = <T extends string>(
    options: { value: T; label: string }[],
    selected: T | '',
    pick: (value: T) => void,
  ): ReactElement => (
    <div className={controls.pillWrap} role="radiogroup">
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`${controls.pill} ${active ? controls.pillSelected : ''}`}
            onClick={() => pick(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={controls.stack}>
      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Target muscle groups</p>
          <p className={controls.sectionSub}>Pick the areas you want to prioritise.</p>
        </div>
        {pills(MUSCLE_GROUPS, value.targetMuscleGroups, (group) =>
          onChange({ targetMuscleGroups: toggleValue(value.targetMuscleGroups, group) }),
        )}
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Available equipment</p>
          <p className={controls.sectionSub}>What can you train with?</p>
        </div>
        {pills(EQUIPMENT, value.equipment, (item) =>
          onChange({ equipment: toggleValue(value.equipment, item) }),
        )}
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Session structure</p>
        </div>
        <div className={styles.stepperGrid}>
          <div className={controls.fieldGroup}>
            <span className={controls.fieldLabel}>Exercises / session</span>
            <NumberStepper
              ariaLabel="exercises per session"
              value={value.exercisesPerSession}
              onChange={(exercisesPerSession) => onChange({ exercisesPerSession })}
              min={1}
              max={50}
              unit=""
              disabled={disabled}
            />
          </div>
          <div className={controls.fieldGroup}>
            <span className={controls.fieldLabel}>Sets / exercise</span>
            <NumberStepper
              ariaLabel="sets per exercise"
              value={value.setsPerExercise}
              onChange={(setsPerExercise) => onChange({ setsPerExercise })}
              min={1}
              max={20}
              unit=""
              disabled={disabled}
            />
          </div>
          <div className={controls.fieldGroup}>
            <span className={controls.fieldLabel}>Reps / exercise</span>
            <NumberStepper
              ariaLabel="reps per exercise"
              value={value.repsPerExercise}
              onChange={(repsPerExercise) => onChange({ repsPerExercise })}
              min={1}
              max={100}
              unit=""
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Experience level</p>
        </div>
        {chips(LEVELS, value.experienceLevel, (experienceLevel) => onChange({ experienceLevel }))}
      </div>

      <div className={controls.card}>
        <div className={controls.sectionHead}>
          <p className={controls.sectionTitle}>Preferred split</p>
          <p className={controls.sectionSub}>Optional — how you like to organise the week.</p>
        </div>
        {chips(SPLITS, value.splitPreference, (splitPreference) => onChange({ splitPreference }))}
        <div className={controls.fieldGroup}>
          <span className={controls.labelRow}>
            <span className={controls.fieldLabel}>Favourite exercises</span>
            <span className={controls.labelMuted}>optional</span>
          </span>
          <textarea
            className={controls.textarea}
            value={value.preferredExercises}
            onChange={(event) => onChange({ preferredExercises: event.target.value })}
            maxLength={800}
            rows={2}
            placeholder="e.g. squat, bench press, deadlift"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
