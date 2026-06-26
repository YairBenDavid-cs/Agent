import { Types } from 'mongoose';
import { Program, ProgramWeek } from '../domain/program.model';
import { ProgramDoc, ProgramWeekClass } from './program.schema';

/** Lean doc as returned by Mongo reads — carries the generated `_id`. */
export type ProgramLean = ProgramDoc & { _id: Types.ObjectId };

/**
 * Pure mappers between the domain model (camelCase) and the persistence (DAO,
 * snake_case) shape. No I/O, no side effects. Written field-by-field.
 *
 * `toDomain` accepts the lean doc plus its Mongo `_id` (stringified by the
 * repository) so the domain `Program` can expose a stable id where needed.
 */

const weekToPersistence = (w: ProgramWeek): ProgramWeekClass => ({
  week_index: w.weekIndex,
  start_date: w.startDate,
  end_date: w.endDate,
  theme: w.theme,
  planned_load_target: w.plannedLoadTarget,
  plan_state: w.planState,
  status: w.status,
  generated_at: w.generatedAt,
});

const weekToDomain = (w: ProgramWeekClass): ProgramWeek => ({
  weekIndex: w.week_index,
  startDate: w.start_date,
  endDate: w.end_date,
  theme: w.theme,
  plannedLoadTarget: w.planned_load_target ?? null,
  planState: w.plan_state,
  status: w.status,
  generatedAt: w.generated_at ?? null,
});

export const toPersistence = (program: Program): ProgramDoc => ({
  user_id: program.userId,
  training_profile_id: program.trainingProfileId,
  discipline: program.discipline,
  goal_snapshot: {
    primary_goal: program.goalSnapshot.primaryGoal,
    note: program.goalSnapshot.note,
    horizon: program.goalSnapshot.horizon,
  },
  start_date: program.startDate,
  horizon_date: program.horizonDate,
  status: program.status,
  current_week_index: program.currentWeekIndex,
  weeks: program.weeks.map(weekToPersistence),
});

export const toDomain = (doc: ProgramLean): Program => ({
  id: doc._id?.toString() ?? null,
  userId: doc.user_id,
  trainingProfileId: doc.training_profile_id ?? null,
  discipline: doc.discipline,
  goalSnapshot: {
    primaryGoal: doc.goal_snapshot.primary_goal,
    note: doc.goal_snapshot.note ?? null,
    horizon: doc.goal_snapshot.horizon,
  },
  startDate: doc.start_date,
  horizonDate: doc.horizon_date,
  status: doc.status,
  currentWeekIndex: doc.current_week_index,
  weeks: (doc.weeks ?? []).map(weekToDomain),
});
