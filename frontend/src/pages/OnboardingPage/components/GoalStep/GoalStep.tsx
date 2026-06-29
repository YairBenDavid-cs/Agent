import type { ReactElement } from 'react';
import type { Discipline, PrimaryGoal } from '../../domain/types';
import { goalsForDiscipline } from '../../domain/goals';
import type { GoalDraft } from '../../state/onboardingDraft';
import { OptionTileGroup, type TileOption } from '../OptionChips/OptionTileGroup';
import section from '../stepSection.module.css';
import fieldStyles from '../Field/Field.module.css';

/** Outline SVG path data per goal, drawn at 24×24. */
const GOAL_ICON_PATHS: Record<PrimaryGoal, string> = {
  build_endurance: 'M3 12h4l2-6 4 12 2-6h6',
  lose_weight:
    'M12 3c1.5 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.6.8-2.8 1.7-3.6.2 1.5 1.8 1.6 1.8.2 0-1.6-1.3-2.6-.2-4.6z',
  build_muscle: 'M4 12h16M6.5 8.5v7M3.7 10v4M17.5 8.5v7M20.3 10v4',
  get_stronger: 'M3 17l5-5 4 3 8-8M15 7h6v6',
  race_prep: 'M5 21V4M5 4h11l-2 4 2 4H5',
  general_fitness: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z',
  improve_speed: 'M12 14l4-4M5.6 18a9 9 0 1 1 12.8 0',
  run_longer: 'M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4',
  build_power: 'M13 2 4 14h6l-1 8 9-12h-6z',
  body_recomp: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M16 8l2-2M6 18l2-2',
};

function GoalIcon({ goal }: { goal: PrimaryGoal }): ReactElement {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={GOAL_ICON_PATHS[goal]} />
    </svg>
  );
}

interface GoalStepProps {
  value: GoalDraft;
  discipline: Discipline;
  onChange: (patch: Partial<GoalDraft>) => void;
  disabled: boolean;
}

export function GoalStep({ value, discipline, onChange, disabled }: GoalStepProps): ReactElement {
  const options: TileOption<PrimaryGoal>[] = goalsForDiscipline(discipline).map((goal) => ({
    value: goal.value,
    label: goal.label,
    description: goal.description,
    icon: <GoalIcon goal={goal.value} />,
  }));

  return (
    <div className={section.stack}>
      <div className={section.section}>
        <p className={section.sectionTitle}>Primary goal</p>
        <OptionTileGroup
          options={options}
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
