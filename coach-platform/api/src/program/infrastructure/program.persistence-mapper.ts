import { Types } from 'mongoose';
import {
  Program,
  ProgramWeek,
  WeeklyTargets,
  WeeklyTargetsRevision,
} from '../domain/program.model';
import {
  ProgramDoc,
  ProgramWeekClass,
  WeeklyTargetsClass,
  WeeklyTargetsRevisionClass,
} from './program.schema';

/** Lean doc as returned by Mongo reads — carries the generated `_id`. */
export type ProgramLean = ProgramDoc & { _id: Types.ObjectId };

/**
 * Pure mappers between the domain model (camelCase) and the persistence (DAO,
 * snake_case) shape. No I/O, no side effects. Written field-by-field.
 *
 * `toDomain` accepts the lean doc plus its Mongo `_id` (stringified by the
 * repository) so the domain `Program` can expose a stable id where needed.
 */

const revisionToPersistence = (
  r: WeeklyTargetsRevision,
): WeeklyTargetsRevisionClass => ({
  revised_at: r.revisedAt,
  previous_session_count: r.previous.sessionCount,
  previous_total_volume: r.previous.totalVolume,
  previous_key_goals: r.previous.keyGoals,
  reason: r.reason,
  triggered_by: r.triggeredBy,
});

const revisionToDomain = (
  r: WeeklyTargetsRevisionClass,
): WeeklyTargetsRevision => ({
  revisedAt: r.revised_at,
  previous: {
    sessionCount: r.previous_session_count,
    totalVolume: r.previous_total_volume,
    keyGoals: r.previous_key_goals ?? [],
  },
  reason: r.reason,
  triggeredBy: r.triggered_by,
});

const targetsToPersistence = (
  t: WeeklyTargets,
): WeeklyTargetsClass => ({
  session_count: t.sessionCount,
  total_volume: t.totalVolume,
  key_goals: t.keyGoals,
  locked_at: t.lockedAt,
  revision_history: (t.revisionHistory ?? []).map(revisionToPersistence),
});

const targetsToDomain = (t: WeeklyTargetsClass): WeeklyTargets => ({
  sessionCount: t.session_count,
  totalVolume: t.total_volume,
  keyGoals: t.key_goals ?? [],
  lockedAt: t.locked_at ?? null,
  revisionHistory: (t.revision_history ?? []).map(revisionToDomain),
});

const weekToPersistence = (w: ProgramWeek): ProgramWeekClass => ({
  week_index: w.weekIndex,
  start_date: w.startDate,
  end_date: w.endDate,
  theme: w.theme,
  planned_load_target: w.plannedLoadTarget,
  plan_state: w.planState,
  status: w.status,
  generated_at: w.generatedAt,
  week_state: w.weekState ?? 'open',
  weekly_targets: w.weeklyTargets ? targetsToPersistence(w.weeklyTargets) : null,
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
  // Legacy weeks predate Step A — default to an open week with no quota.
  weekState: w.week_state ?? 'open',
  weeklyTargets: w.weekly_targets ? targetsToDomain(w.weekly_targets) : null,
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
