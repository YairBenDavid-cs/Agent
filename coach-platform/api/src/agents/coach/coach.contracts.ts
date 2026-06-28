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
    .enum(['base', 'build', 'peak', 'deload', 'taper'])
    .describe('Periodization phase for the week.'),
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

// ── upsert_week_sessions ───────────────────────────────────────────────────

const runSegmentSchema = z.object({
  kind: z.enum(['warmup', 'work', 'recovery', 'cooldown']),
  repeat: z.number().int().min(1).default(1),
  distanceM: z.number().nullable().default(null),
  durationSec: z.number().nullable().default(null),
  targetPace: z.string().nullable().default(null).describe('"mm:ss/km"'),
  targetHrZone: z.number().int().min(1).max(5).nullable().default(null),
  restSec: z.number().nullable().default(null),
});

const runningPlanSchema = z.object({
  runType: z.string().describe('e.g. easy, long, tempo, intervals, recovery.'),
  totalDistanceKm: z.number().nullable().default(null),
  totalDurationMin: z.number().nullable().default(null),
  targetPace: z.string().nullable().default(null),
  targetHrZone: z.number().int().min(1).max(5).nullable().default(null),
  targetRpe: z.number().int().min(1).max(10).nullable().default(null),
  segments: z.array(runSegmentSchema).default([]),
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
