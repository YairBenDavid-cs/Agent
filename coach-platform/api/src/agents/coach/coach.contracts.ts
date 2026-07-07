import { z } from 'zod';

/**
 * Output contracts for the Coach's two terminal write tools. Zod is the single
 * source of truth: it generates the model-facing JSON Schema AND validates the
 * arguments before the guardrail + command run.
 *
 * Boundary note (Coach Q7): the Coach owns CONTENT + sequencing/spacing intent +
 * `estDurationMin` + a soft `dayOffset` day-type hint — NOT firm calendar slots.
 * The Planner owns the real `scheduledDate` / times downstream.
 */

const isoDate = z
  .string()
  .describe('Calendar date, e.g. "2026-06-28" (YYYY-MM-DD, local).');

// ── commit_program_skeleton ────────────────────────────────────────────────

export const skeletonWeekSchema = z.object({
  weekIndex: z.number().int().min(0),
  startDate: isoDate.describe('Inclusive local start of the week.'),
  endDate: isoDate.describe('Inclusive local end of the week.'),
  theme: z
    .enum(['assessment', 'base', 'build', 'peak', 'deload', 'taper'])
    .describe(
      'Periodization phase. Use "assessment" for an early baseline week (time-' +
        'trial / top-set test) when the user has no hard pace/load numbers yet.',
    ),
  plannedLoadTarget: z
    .number()
    .nullable()
    .default(null)
    .describe('Intended weekly training load (relative units), or null.'),
  planState: z
    .enum(['committed', 'tentative'])
    .describe('Only the current/imminent week is committed; rest tentative.'),
  status: z.enum(['upcoming', 'current', 'done']),
});
export type SkeletonWeekArgs = z.infer<typeof skeletonWeekSchema>;

export const commitSkeletonSchema = z.object({
  programId: z.string(),
  currentWeekIndex: z
    .number()
    .int()
    .min(0)
    .describe('Index into weeks[] for the week the user is training now.'),
  weeks: z
    .array(skeletonWeekSchema)
    .min(1)
    .describe('Full periodization skeleton (~12 weeks), week 0 first.'),
  rationale: z
    .string()
    .min(1)
    .describe('Why this periodization shape serves the goal (coachNotes-style).'),
});
export type CommitSkeletonArgs = z.infer<typeof commitSkeletonSchema>;

// ── lock_weekly_targets (Step A: weekly macro budget) ──────────────────────

export const lockWeeklyTargetsSchema = z.object({
  programId: z.string(),
  weekIndex: z.number().int().min(0),
  sessionCount: z
    .number()
    .int()
    .min(1)
    .describe('How many sessions this week should hold (the locked quota).'),
  totalVolume: z
    .number()
    .min(0)
    .describe(
      'Native-unit weekly volume budget: total kilometres (running) or ' +
        'total volume-load (strength). Per-session drafts must sum within it.',
    ),
  keyGoals: z
    .array(z.string())
    .default([])
    .describe('Free-text weekly intents, e.g. "one quality tempo", "long run".'),
  rationale: z
    .string()
    .min(1)
    .describe('Why this macro budget serves the goal + the week theme.'),
});
export type LockWeeklyTargetsArgs = z.infer<typeof lockWeeklyTargetsSchema>;

// ── propose_weekly_targets (conversational build: tentative Step A) ─────────
//
// Same shape as the lock, but NON-terminal: it stages a *tentative* proposal
// (week stays `open`, `lockedAt=null`) so the coach can then explain it in plain
// language and the user can accept or revise. The lock only happens on consent.
export const proposeWeeklyTargetsSchema = z.object({
  programId: z.string(),
  weekIndex: z.number().int().min(0),
  sessionCount: z
    .number()
    .int()
    .min(1)
    .describe('How many sessions this week should hold (proposed quota).'),
  totalVolume: z
    .number()
    .min(0)
    .describe(
      'Native-unit weekly volume budget: total kilometres (running) or ' +
        'total volume-load (strength).',
    ),
  keyGoals: z
    .array(z.string())
    .default([])
    .describe('Free-text weekly intents, e.g. "one quality tempo", "long run".'),
  rationale: z
    .string()
    .min(1)
    .describe('Why this macro budget serves the goal + the week theme.'),
});
export type ProposeWeeklyTargetsArgs = z.infer<typeof proposeWeeklyTargetsSchema>;

// ── upsert_week_sessions ───────────────────────────────────────────────────

const runStepSchema = z.object({
  type: z
    .enum(['run', 'rest'])
    .describe('"run" = active running, "rest" = recovery/walk interval.'),
  distanceM: z
    .number()
    .nullable()
    .default(null)
    .describe('Step distance in metres. Set this OR durationSec, not both.'),
  durationSec: z.number().nullable().default(null),
  targetPace: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'Free text: a concrete pace "4:30/km" OR a cue like "conversational". ' +
        'Null for rest steps.',
    ),
  targetHrZone: z.number().int().min(1).max(5).nullable().default(null),
  note: z
    .string()
    .nullable()
    .default(null)
    .describe('Secondary coaching cue, e.g. "No faster than 5:15/km", "or slower!".'),
});

const runBlockSchema = z.object({
  kind: z.enum(['warmup', 'work', 'recovery', 'cooldown']),
  label: z
    .string()
    .nullable()
    .default(null)
    .describe('Display title override, e.g. "Tempo" / "Main". Falls back to kind.'),
  repeat: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe('Times to repeat this block; >1 renders as "Repeat xN".'),
  steps: z
    .array(runStepSchema)
    .min(1)
    .describe('Ordered run/rest steps within the block.'),
});

const runningPlanSchema = z.object({
  runType: z.string().describe('e.g. easy, long, tempo, intervals, recovery.'),
  totalDistanceKm: z.number().nullable().default(null),
  totalDurationMin: z.number().nullable().default(null),
  targetPace: z.string().nullable().default(null),
  targetHrZone: z.number().int().min(1).max(5).nullable().default(null),
  targetRpe: z.number().int().min(1).max(10).nullable().default(null),
  blocks: z
    .array(runBlockSchema)
    .min(1)
    .describe(
      'Full step-by-step structure: warmup -> work (intervals via repeat) -> ' +
        'cooldown. REQUIRED — never emit a running session without blocks.',
    ),
});

const plannedExerciseSchema = z.object({
  name: z.string(),
  category: z.string(),
  order: z.number().int().min(0),
  sets: z.number().int().min(1),
  targetRepsMin: z.number().int().min(1),
  targetRepsMax: z.number().int().min(1),
  targetWeightKg: z.number().nullable().default(null),
  targetPct1rm: z.number().nullable().default(null),
  targetRir: z.number().nullable().default(null),
  restSec: z.number().nullable().default(null),
  tempo: z.string().nullable().default(null),
  supersetGroup: z.string().nullable().default(null),
});

const strengthPlanSchema = z.object({
  splitFocus: z.string().nullable().default(null),
  exercises: z.array(plannedExerciseSchema).min(1),
  targetVolumeLoad: z.number().nullable().default(null),
});

export const plannedSessionDraftSchema = z.object({
  slotKey: z
    .string()
    .describe('Stable idempotency key within (program, week), e.g. "run-1".'),
  type: z.enum(['running', 'strength']),
  dayOffset: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe(
      'Soft day-of-week hint within the week (0 = week start). Sequencing/' +
        'spacing intent only — the Planner sets the real date/time.',
    ),
  title: z.string(),
  estDurationMin: z.number().int().positive(),
  intensityLabel: z
    .enum(['easy', 'moderate', 'hard'])
    .describe('Drives the readiness/recovery intensity cap.'),
  coachNotes: z
    .string()
    .min(1)
    .describe('Rationale for THIS train (mandatory — persisted for "why?").'),
  running: runningPlanSchema.nullable().default(null),
  strength: strengthPlanSchema.nullable().default(null),
});
export type PlannedSessionDraft = z.infer<typeof plannedSessionDraftSchema>;

export const upsertWeekSessionsSchema = z.object({
  programId: z.string(),
  weekIndex: z.number().int().min(0),
  weekStartDate: isoDate.describe('Local start date of the target week.'),
  timezone: z.string().describe('IANA tz snapshot, e.g. "Europe/Berlin".'),
  sessions: z.array(plannedSessionDraftSchema).min(1),
});
export type UpsertWeekSessionsArgs = z.infer<typeof upsertWeekSessionsSchema>;

// ── draft_next_session (conversational build: ONE session at a time) ────────
//
// Step B of the conversational build, per-session: draft EXACTLY ONE tentative
// session — the next one not yet committed — so the athlete can review and
// approve it on its own card before the next is drafted. Must fit inside the
// LOCKED weekly targets given the sessions already committed (quota guardrail).
export const draftSessionSchema = z.object({
  programId: z.string(),
  weekIndex: z.number().int().min(0),
  weekStartDate: isoDate.describe('Local start date of the target week.'),
  timezone: z.string().describe('IANA tz snapshot, e.g. "Europe/Berlin".'),
  session: plannedSessionDraftSchema.describe(
    'The single next session to draft (tentative). Its slotKey must be unique ' +
      'within the week and must not collide with an already-committed session.',
  ),
});
export type DraftSessionArgs = z.infer<typeof draftSessionSchema>;

// ── revise_session_content (reactive edit: ONE existing session) ────────────
//
// The content-edit sibling of `draft_next_session`: overwrite an EXISTING
// train's prescription per the athlete's requested change. Never touches
// slotKey/dayOffset (schedule/identity are unchanged) — only the content the
// Coach owns. `changes` is the display diff shown in chat.
const sessionDiffChangeSchema = z.object({
  field: z.string().describe('Human label, e.g. "totalDistanceKm".'),
  before: z.union([z.string(), z.number(), z.null()]),
  after: z.union([z.string(), z.number(), z.null()]),
});

export const reviseSessionContentSchema = z.object({
  session: plannedSessionDraftSchema
    .omit({ slotKey: true, dayOffset: true })
    .describe('The FULL updated prescription — every field, not only what changed.'),
  changes: z
    .array(sessionDiffChangeSchema)
    .min(1)
    .describe('Field-level before/after pairs for the display diff.'),
});
export type ReviseSessionContentArgs = z.infer<typeof reviseSessionContentSchema>;
