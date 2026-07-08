import { z } from 'zod';
import { PreferenceTagType } from '../../personalization/domain/preference-event.model';

/**
 * The chat-assistant's structured output contract. The assistant runs ONE
 * bounded loop (read-tools for investigation + advisory delegation), then ends
 * by calling the single terminal `assistant_turn` tool that DECLARES its
 * decision. The assistant never holds specialist write tools — it only declares
 * intent; the deterministic code (decideActions) performs the eager preference
 * write and decides whether to fire a pipeline. That keeps every guardrail and
 * write centralized.
 *
 * Lanes (the per-turn classifier output):
 *  - white = query → `reply` only, no capture, no pipeline.
 *  - black = explicit order → `captured` items (written as confidence=explicit),
 *            `reply` reflects the understanding back.
 *  - gray  = ambiguous → EITHER a grounded `clarifyingQuestion` (no write yet)
 *            OR, when the user gave no explicit confirmation, demoted `captured`
 *            items written as confidence=inferred + batched (reinforcement only).
 */

export const ASSISTANT_LANES = ['white', 'black', 'gray'] as const;
export type AssistantLane = (typeof ASSISTANT_LANES)[number];

// Kept aligned with PreferenceTagType in preference-event.model.ts.
const TAG_TYPES = [
  'disliked_time',
  'disliked_exercise',
  'volume_too_high',
  'volume_too_low',
  'too_hard',
  'too_easy',
  'no_motivation',
  'injury_or_illness',
  'overreaching',
  'time_constraint',
  'weather',
  'travel',
  'equipment_removed',
  'equipment_added',
  'time_window_blocked',
  'time_window_preferred',
  'diversity_request',
  'volume_bias',
  'intensity_bias',
  'modality_pref',
  'exercise_override',
  'injury',
  'session_duration',
  'sessions_per_week',
  'weekly_km',
  'run_type_pref',
  'split_preference',
  'exercises_per_session',
  'default_sets',
  'default_reps',
  'muscle_group_pref',
  'exercise_prescription',
  'experience_level',
  'primary_goal',
  'other',
] as const satisfies readonly PreferenceTagType[];

export const capturedSignalSchema = z.object({
  tagType: z.enum(TAG_TYPES),
  value: z.union([z.string(), z.number()]).nullable(),
  polarity: z.enum(['avoid', 'prefer', 'increase', 'decrease', 'neutral']),
  durability: z.enum(['standing', 'one_off']),
  scope: z.enum(['global', 'session', 'exercise']),
  discipline: z.enum(['running', 'strength']).nullable(),
  /**
   * The assistant's GROUNDED judgment (it has read-tools to check the upcoming
   * week) of whether this change touches the week the user is about to train.
   * Drives the eager-write-vs-immediate-replan firing boundary in code.
   */
  affectsCurrentWeek: z.boolean(),
  target: z
    .object({
      plannedSessionId: z.string().nullable().optional(),
      exerciseId: z.string().nullable().optional(),
      runType: z
        .enum(['easy', 'tempo', 'fartlek', 'intervals', 'long', 'recovery'])
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  rawText: z.string().optional(),
  /**
   * Why this signal was captured — grounded from the message/conversation via
   * the interview protocol, never invented. Required so WHY always rides
   * along into the persisted preference event.
   */
  rationale: z.string().min(1),
});
export type CapturedSignal = z.infer<typeof capturedSignalSchema>;

/**
 * A direct edit to a program week's macro budget, or to one session's content,
 * that (if it breaches the week's locked targets) may cascade into a target
 * revision. Distinct from `CapturedSignal` (durable preference events) — this
 * is a one-shot structural edit resolved against a specific `weekIndex` /
 * `plannedSessionId`, never assumed to be "the current week".
 */
export const weekEditSchema = z.object({
  weekIndex: z
    .number()
    .int()
    .min(0)
    .describe(
      "The program week this edit targets, resolved via get_week / " +
        "query_planned_sessions — NEVER assumed to be the current week.",
    ),
  kind: z.enum(['session_content_edit', 'target_revision', 'session_reschedule']),
  plannedSessionId: z
    .string()
    .nullable()
    .describe(
      'Required for session_content_edit and session_reschedule; null for ' +
        'target_revision.',
    ),
  plannedSessionIds: z
    .array(z.string())
    .default([])
    .describe(
      'For a session_content_edit that applies the SAME change to several ' +
        'sessions (e.g. "slow down all my runs this week"): every affected ' +
        'plannedSessionId. Leave empty for a single-session edit.',
    ),
  newDate: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'session_reschedule only: the new local date (YYYY-MM-DD), or null to ' +
        'keep the current date and change only the time.',
    ),
  newStartTime: z
    .string()
    .nullable()
    .default(null)
    .describe(
      'session_reschedule only: the new local start time (HH:mm), or null to ' +
        'keep the current start time and change only the date.',
    ),
  newSessionVolume: z
    .number()
    .nullable()
    .default(null)
    .describe(
      "session_content_edit only: the edited session's resulting volume in " +
        'the native unit (km for running, volume-load for strength), when the ' +
        'request implies one (e.g. "make it 15km" → 15). Code uses this to ' +
        'verify your breach judgment against the locked weekly targets.',
    ),
  requestedChangeDescription: z
    .string()
    .min(1)
    .describe(
      "Plain-language description of what the athlete asked to change, fed " +
        "to the Coach as intent (e.g. \"make Friday's run 15km instead of 10km\").",
    ),
  newTargets: z
    .object({
      sessionCount: z.number().int().min(1),
      totalVolume: z.number().min(0),
      keyGoals: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null)
    .describe(
      'Required for target_revision (the proposed replacement budget). For ' +
        'session_content_edit, set ONLY when breachesLockedTargets is true — ' +
        'these become the new locked numbers once confirmed.',
    ),
  breachesLockedTargets: z
    .boolean()
    .describe(
      "Whether this edit, as requested, would exceed the week's currently " +
        'locked targets (sessionCount or total volume).',
    ),
  confirmed: z
    .boolean()
    .describe(
      'True once the athlete has explicitly agreed to proceed, including any ' +
        'cascade. False means a breach was detected and `clarifyingQuestion` is ' +
        'asking for the go-ahead — write and fire NOTHING this turn.',
    ),
  rationale: z
    .string()
    .min(1)
    .describe('Why this edit (and any cascade) serves the goal.'),
});
export type WeekEdit = z.infer<typeof weekEditSchema>;

export const assistantTurnSchema = z.object({
  lane: z.enum(ASSISTANT_LANES),
  /** The user-facing message: an answer (white), a reflection (black), or a question (gray). */
  reply: z.string().min(1),
  /**
   * Extracted preference signals. For black these are written as explicit; for
   * gray (no confirmation) they are demoted to inferred + batched. Empty when
   * the turn is a pure query or a clarifying question.
   */
  captured: z.array(capturedSignalSchema).default([]),
  /**
   * Set ONLY on gray when the assistant needs the user to confirm before acting.
   * When set, `captured` must be empty (we await the reply, write nothing).
   */
  clarifyingQuestion: z.string().nullable().default(null),
  /**
   * Set when the user is asking to directly change a week's goal or a single
   * session's content. Null for ordinary preference/query turns.
   */
  weekEdit: weekEditSchema.nullable().default(null),
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;
