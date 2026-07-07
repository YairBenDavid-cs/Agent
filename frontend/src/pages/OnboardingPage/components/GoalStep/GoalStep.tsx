import type { ReactElement } from 'react';
import type { Discipline } from '../../domain/types';
import { goalsForDiscipline } from '../../domain/goals';
import type { GoalDraft } from '../../state/onboardingDraft';
import controls from '../controls.module.css';
import styles from './GoalStep.module.css';

interface GoalStepProps {
  value: GoalDraft;
  discipline: Discipline;
  onChange: (patch: Partial<GoalDraft>) => void;
  disabled: boolean;
}

export function GoalStep({ value, discipline, onChange, disabled }: GoalStepProps): ReactElement {
  const goals = goalsForDiscipline(discipline);

  return (
    <div className={controls.stack}>
      <div className={styles.grid} role="radiogroup">
        {goals.map((goal) => {
          const active = goal.value === value.primaryGoal;
          return (
            <button
              key={goal.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.tile} ${active ? styles.selected : ''}`}
              onClick={() => onChange({ primaryGoal: goal.value })}
              disabled={disabled}
            >
              <span className={styles.label}>{goal.label}</span>
              <span className={styles.desc}>{goal.description}</span>
            </button>
          );
        })}
      </div>
      <div className={controls.fieldGroup}>
        <span className={controls.labelRow}>
          <span className={controls.fieldLabel}>Anything specific?</span>
          <span className={controls.labelMuted}>optional</span>
        </span>
        <textarea
          className={controls.textarea}
          value={value.note}
          onChange={(event) => onChange({ note: event.target.value })}
          maxLength={500}
          rows={2}
          placeholder="e.g. Sub-50-minute 10K by spring"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
