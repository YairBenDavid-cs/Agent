/**
 * Domain model for a single *planned* train — the prescription the user is
 * meant to perform. This is deliberately distinct from `sessions` (the observed
 * result): a plan describes intended structure (intervals, load targets), while
 * a session describes what actually happened (splits, achieved 1RMs).
 *
 * Framework-free. Mirrors the `type: 'running' | 'strength'` discriminator used
 * by `sessions`, so adherence comparison is field-aligned (planned vs actual).
 *
 * Invariant: exactly one of `running` / `strength` is populated, matching `type`.
 *
 * Generation logic does NOT live here — these are just the shapes the (future)
 * LLM generator and the matcher read/write.
 */

import { RunType } from '../../training/domain/training-profile.model';

export type PlannedSessionType = 'running' | 'strength';

export type PlanState = 'committed' | 'tentative';

/**
 * Adherence outcome. `planned` until a session is matched or the user reports
 * back. `deviated` = something was done but it differed materially from plan.
 */
export type PlannedStatus =
  | 'planned'
  | 'completed'
  | 'partially_completed'
  | 'skipped'
  | 'deviated';

/** Structured skip/deviation reason — the queryable signal. Free-text rationale
 * and durable preference learning live in the file-first memory, not here. */
export type ReasonCode =
  | 'disliked_time'
  | 'disliked_exercise'
  | 'volume_too_high'
  | 'volume_too_low'
  | 'too_hard'
  | 'too_easy'
  | 'no_motivation'
  | 'injury_or_illness'
  | 'time_constraint'
  | 'weather'
  | 'travel'
  | 'other';

export type SegmentKind = 'warmup' | 'work' | 'recovery' | 'cooldown';

/** Whether a step is active running or a rest interval (drives the RUN/REST badge). */
export type StepType = 'run' | 'rest';

/* ── RUNNING prescription ──────────────────────────────────────── */

/**
 * One row inside a block — a single run or rest interval. `targetPace` is a free
 * string: either a concrete value ("4:30/km") or a qualitative cue
 * ("conversational"). `note` carries the secondary coaching line.
 */
export interface RunStep {
  type: StepType;
  distanceM: number | null; // exactly one of distanceM / durationSec is set
  durationSec: number | null;
  targetPace: string | null;
  targetHrZone: number | null; // 1–5
  note: string | null; // secondary cue, e.g. "No faster than 5:15/km"
}

/**
 * An ordered section of a run. `repeat > 1` expresses interval sets: a 6×(400m +
 * 60s rest) set is `{ kind: 'work', repeat: 6, steps: [run 400m, rest 60s] }`.
 * `label` overrides the display title (e.g. "Tempo", "Main"); falls back to kind.
 */
export interface RunBlock {
  kind: SegmentKind;
  label: string | null;
  repeat: number; // 1 = single pass
  steps: RunStep[];
}

export interface RunningPlan {
  runType: RunType;
  totalDistanceKm: number | null; // target (one of distance/duration)
  totalDurationMin: number | null;
  targetPace: string | null; // "mm:ss/km"
  targetHrZone: number | null; // 1–5
  targetRpe: number | null; // 1–10
  blocks: RunBlock[];
}

/* ── STRENGTH prescription ─────────────────────────────────────── */

export interface PlannedExercise {
  name: string;
  category: string; // aligns with sessions ExerciseAggregate.category
  order: number;
  sets: number;
  targetRepsMin: number; // single target => min === max
  targetRepsMax: number;
  targetWeightKg: number | null; // absolute load target
  targetPct1rm: number | null; // OR % of 1RM
  targetRir: number | null; // OR reps-in-reserve
  restSec: number | null;
  tempo: string | null; // e.g. "3-1-1-0"
  supersetGroup: string | null; // shared label groups a superset
}

export interface StrengthPlan {
  splitFocus: string | null; // e.g. "push" | "pull" | "legs" | "upper" | "full_body"
  exercises: PlannedExercise[];
  targetVolumeLoad: number | null; // for week-over-week vs sessions.session_volume_load
}

/* ── outcome (adherence) ───────────────────────────────────────── */

export interface PlannedOutcome {
  status: PlannedStatus;
  reasonCode: ReasonCode | null;
  perceivedEffort: number | null; // RPE 1–10
  enjoyment: number | null; // 1–5
  matchedActivityId: number | null; // link into `sessions` (Garmin/self-report)
  feedbackRef: string | null; // anchor into file-first memory (future)
  recordedAt: string | null; // ISO timestamp when outcome was set
}

/* ── commit diff (persisted display change) ────────────────────── */

/** One field that changed at the last commit (before → after, display-ready). */
export interface SessionDiffChange {
  field: string; // human label, e.g. "targetPace"
  before: string | number | null;
  after: string | number | null;
}

/**
 * The persisted display diff captured when a session was last committed. Chat-
 * originated edits commit straight to `committed` (no revise/approve buttons),
 * so the UI replays this diff to show the user WHAT changed. Replaced on each
 * subsequent commit; `null` until the session is first committed.
 */
export interface SessionDiff {
  committedAt: string; // ISO timestamp of the commit
  changes: SessionDiffChange[];
}

/* ── calendar sync (placeholder; push logic deferred) ──────────── */

export type CalendarSyncState = 'pending' | 'synced' | 'failed';

export interface CalendarSync {
  provider: string; // 'google'
  eventId: string | null; // presence == app-owned event
  syncedAt: string | null;
  syncState: CalendarSyncState;
}

/* ── root ──────────────────────────────────────────────────────── */

export interface PlannedSession {
  id: string | null; // Mongo _id (stringified); null before insert
  userId: string;
  programId: string;
  weekIndex: number;
  slotKey: string; // deterministic idempotency key within (program, week)

  type: PlannedSessionType;

  // Scheduling — authored in the user's local wall-clock + IANA timezone.
  scheduledDate: string; // YYYY-MM-DD (local)
  startTime: string; // "HH:mm" (local)
  endTime: string; // "HH:mm" (local)
  timezone: string; // IANA, snapshot from the user at generation time
  scheduledStartUtc: string; // derived ISO instant for ordering / reminders

  planState: PlanState;

  // Shared prescription metadata.
  title: string;
  estDurationMin: number;
  intensityLabel: string; // 'easy' | 'moderate' | 'hard'
  coachNotes: string | null; // rationale for this train (agent-authored later)

  // Exactly one is populated, gated by `type`.
  running: RunningPlan | null;
  strength: StrengthPlan | null;

  outcome: PlannedOutcome;
  calendarSync: CalendarSync | null;

  // The display diff from the last commit (chat-originated edits replay this).
  // Optional so legacy rows / pre-commit drafts stay valid; reads default null.
  lastDiff?: SessionDiff | null;
}
