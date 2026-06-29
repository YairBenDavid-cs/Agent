// Single source of truth for the 3-month goal options, branched by discipline.
// Running and strength offer distinct goals (with a couple of shared ones), so
// the goal step and the reducer both read from here to stay consistent. The
// `value`s must all exist in the backend's PrimaryGoal enum (training-profile).
import type { Discipline, PrimaryGoal } from './types';

export interface GoalOption {
  value: PrimaryGoal;
  label: string;
  description: string;
}

export const RUNNING_GOALS: GoalOption[] = [
  { value: 'race_prep', label: 'Race prep', description: 'Peak for an event' },
  { value: 'build_endurance', label: 'Build endurance', description: 'Go longer, recover faster' },
  { value: 'improve_speed', label: 'Improve speed', description: 'Sharper pace, faster splits' },
  { value: 'run_longer', label: 'Go the distance', description: 'Build weekly mileage' },
  { value: 'lose_weight', label: 'Lose weight', description: 'Higher burn, steady deficit' },
  { value: 'general_fitness', label: 'General fitness', description: 'Healthy and consistent' },
];

export const STRENGTH_GOALS: GoalOption[] = [
  { value: 'build_muscle', label: 'Build muscle', description: 'Hypertrophy volume' },
  { value: 'get_stronger', label: 'Get stronger', description: 'Heavier lifts over time' },
  { value: 'build_power', label: 'Build power', description: 'Explosive, athletic strength' },
  { value: 'body_recomp', label: 'Tone & define', description: 'Lean out, stay strong' },
  { value: 'lose_weight', label: 'Lose weight', description: 'Higher burn, steady deficit' },
  { value: 'general_fitness', label: 'General fitness', description: 'Healthy and consistent' },
];

/** The goals offered for a discipline. Defaults to running before one is picked. */
export function goalsForDiscipline(discipline: Discipline | null): GoalOption[] {
  return discipline === 'strength' ? STRENGTH_GOALS : RUNNING_GOALS;
}

/** Whether a goal belongs to a discipline's branch (used to reset stale picks). */
export function isGoalInDiscipline(goal: PrimaryGoal, discipline: Discipline | null): boolean {
  return goalsForDiscipline(discipline).some((g) => g.value === goal);
}
