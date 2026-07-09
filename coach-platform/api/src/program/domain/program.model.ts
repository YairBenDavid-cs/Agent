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
export type WeekTheme =
  | 'assessment'
  | 'base'
  | 'build'
  | 'peak'
  | 'deload'
  | 'taper';

/**
 * `committed` = shown to the user and locked (the matcher/outcome may attach,
 * but the generator will not rewrite it). `tentative` = visible preview that a
 * future regeneration may revise.
 */
export type PlanState = 'committed' | 'tentative';

export type WeekStatus = 'upcoming' | 'current' | 'done';

/**
 * Lifecycle of a week's plan within the iterative (Step A → B → C) generation:
 * - `open`          — nothing locked; the macro shape may still change.
 * - `targets_locked`— Step A is committed: the weekly quota (session count /
 *                     volume / key goals) is frozen, and per-session drafting
 *                     (Step B) must fit inside it. Targets are immutable once set.
 * - `locked`        — every session is committed; the week is closed to
 *                     whole-week regeneration. While the week is still CURRENT
 *                     (its endDate has not passed), reactive single-session
 *                     edits (SESSION_CONTENT_REPLAN), reschedules, and the
 *                     target revision a confirmed edit cascades into remain
 *                     available. Once the week's endDate passes it is a
 *                     historical record and immutable everywhere.
 */
export type WeekState = 'open' | 'targets_locked' | 'locked';

/**
 * Step-A weekly macro budget. Frozen by `LockWeeklyTargetsCommand`, after which
 * per-session generation (Step B) must fit inside it — the
 * `validateAgainstWeeklyTargets` guardrail bounces any draft that overshoots.
 * `totalVolume` is in the discipline's native unit (km for running,
 * volume-load for strength), matching the session prescription fields.
 */
export interface WeeklyTargets {
  sessionCount: number; // how many sessions the week should hold
  totalVolume: number; // native-unit budget (km or volume-load)
  keyGoals: string[]; // free-text intents, e.g. "one quality tempo"
  lockedAt: string | null; // ISO timestamp when Step A was frozen
  revisionHistory?: WeeklyTargetsRevision[]; // absent/empty = never revised post-lock
}

/**
 * One entry in a locked week's audit trail. Written by `ReviseWeeklyTargetsCommand`
 * when a locked/targets_locked week's quota is revised in place (the reactive-edit
 * path) — `previous` preserves the quota being overwritten so it is never silently
 * lost, matching the immutability promise `LockWeeklyTargetsCommand` makes at
 * first-lock time.
 */
export interface WeeklyTargetsRevision {
  revisedAt: string; // ISO timestamp
  previous: Pick<WeeklyTargets, 'sessionCount' | 'totalVolume' | 'keyGoals'>;
  reason: string; // human-readable, surfaced in timeline/diff UI
  triggeredBy: 'session_edit' | 'direct_target_change' | 'auto_mode_revert';
}

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
  // Iterative-generation state. Optional so legacy skeleton literals (which
  // predate Step A) stay valid; the mapper defaults reads to 'open' / null.
  weekState?: WeekState;
  weeklyTargets?: WeeklyTargets | null;
  // Optimistic lock held by an in-flight AutoModeRun. Prevents a concurrent
  // manual edit or a second autonomous run from mutating the same week.
  runLockId?: string | null;
  runLockedAt?: string | null;
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
