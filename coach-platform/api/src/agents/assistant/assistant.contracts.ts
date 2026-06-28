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
});
export type CapturedSignal = z.infer<typeof capturedSignalSchema>;

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
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;
