import type { ReactElement } from 'react';
import type { PrimaryGoal } from '../../domain/types';
import type { GoalDraft } from '../../state/onboardingDraft';
import { OptionGroup, type ChipOption } from '../OptionChips/OptionGroup';
import section from '../stepSection.module.css';
import fieldStyles from '../Field/Field.module.css';

const GOALS: ChipOption<PrimaryGoal>[] = [
  { value: 'build_endurance', label: 'Build endurance' },
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'get_stronger', label: 'Get stronger' },
  { value: 'race_prep', label: 'Race prep' },
  { value: 'general_fitness', label: 'General fitness' },
];

interface GoalStepProps {
  value: GoalDraft;
  onChange: (patch: Partial<GoalDraft>) => void;
  disabled: boolean;
}

export function GoalStep({ value, onChange, disabled }: GoalStepProps): ReactElement {
  return (
    <div className={section.stack}>
      <div className={section.section}>
        <p className={section.sectionTitle}>Primary goal</p>
        <OptionGroup
          options={GOALS}
          value={value.primaryGoal}
          onChange={(primaryGoal) => onChange({ primaryGoal })}
          disabled={disabled}
        />
      </div>
      <label className={fieldStyles.field}>
        <span className={fieldStyles.labelRow}>
          <span className={fieldStyles.label}>Anything else your coach should know?</span>
          <span className={fieldStyles.optional}>optional</span>
        </span>
        <textarea
          className={`${fieldStyles.input} ${fieldStyles.textarea}`}
          value={value.note}
          onChange={(event) => onChange({ note: event.target.value })}
          maxLength={500}
          placeholder="e.g. coming back from injury, training for a spring half-marathon…"
          disabled={disabled}
        />
      </label>
    </div>
  );
}
