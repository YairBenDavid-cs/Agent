/**
 * Domain model for a user's training Program — the 3-month container that the
 * (future) generator fills with planned trains one rolling week at a time.
 *
 * Framework-free: no Nest, no Mongoose, no class-validator.
 *
 * Design notes:
 * - The program holds ONLY plan-level metadata + a bounded `weeks[]` skeleton.
 *   Individual trains live in the `planned_sessions` collection, referenced by
 *   `program_id` + `week_index`. This keeps the doc small and makes calendar /
 *   per-train reads cheap single-doc operations.
 * - `goal_snapshot` copies the onboarding goal at creation, so later profile
 *   edits never rewrite the program's intent (history stays honest).
 * - At most one 'active' program per user (enforced by a partial-unique index).
 */

import { Discipline } from '../../training/domain/training-profile.model';

export type { Discipline };

export type ProgramStatus = 'active' | 'completed' | 'abandoned';

/** Periodization phase for a week. Sketched up front; trains filled weekly. */
export type WeekTheme = 'base' | 'build' | 'peak' | 'deload' | 'taper';

/**
 * `committed` = shown to the user and locked (the matcher/outcome may attach,
 * but the generator will not rewrite it). `tentative` = visible preview that a
 * future regeneration may revise.
 */
export type PlanState = 'committed' | 'tentative';

export type WeekStatus = 'upcoming' | 'current' | 'done';

/** A point-in-time copy of the goal that seeded the program. */
export interface GoalSnapshot {
  primaryGoal: string;
  note: string | null;
  horizon: string; // YYYY-MM-DD
}

/** One entry in the bounded (~12) periodization skeleton. */
export interface ProgramWeek {
  weekIndex: number; // 0-based
  startDate: string; // YYYY-MM-DD (local), inclusive
  endDate: string; // YYYY-MM-DD (local), inclusive
  theme: WeekTheme;
  plannedLoadTarget: number | null; // optional intended weekly load
  planState: PlanState;
  status: WeekStatus;
  generatedAt: string | null; // ISO timestamp when trains were generated
}

export interface Program {
  id: string | null; // Mongo _id (stringified); null before insert
  userId: string;
  trainingProfileId: string | null; // link to the onboarding output that seeded it
  discipline: Discipline;
  goalSnapshot: GoalSnapshot;
  startDate: string; // YYYY-MM-DD (local)
  horizonDate: string; // YYYY-MM-DD (local) — goal target ~3 months out
  status: ProgramStatus;
  currentWeekIndex: number;
  weeks: ProgramWeek[];
}
