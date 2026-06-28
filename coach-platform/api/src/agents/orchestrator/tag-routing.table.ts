import { PreferenceTagType } from '../../personalization/domain/preference-event.model';
import { Pipeline } from './pipeline.types';

/**
 * The deterministic tag-type → pipeline table. The assistant only EXTRACTS a
 * tagged preference_event; this table (not an LLM) selects the minimal pipeline,
 * which keeps choreography centralized and replayable.
 *
 * Routing rationale:
 *  - injury/illness  -> SAFETY_REPLAN (Recovery gate first).
 *  - primary_goal    -> PROGRAM_GENERATION (a major goal change reshapes the skeleton).
 *  - pure timing     -> TIMING_REPLACE (Planner only, no Coach).
 *  - content/training -> CONTENT_REPLAN (Coach re-plans the week, then Planner).
 *  - transient/no-impact -> WRITE_ONLY (log + projection, no agents).
 */
export const TAG_PIPELINE_TABLE: Record<PreferenceTagType, Pipeline> = {
  // ── safety ────────────────────────────────────────────────────────────────
  injury_or_illness: Pipeline.SAFETY_REPLAN,
  injury: Pipeline.SAFETY_REPLAN,

  // ── program-level ───────────────────────────────────────────────────────
  primary_goal: Pipeline.PROGRAM_GENERATION,

  // ── timing-only (Planner, no Coach) ───────────────────────────────────────
  disliked_time: Pipeline.TIMING_REPLACE,
  time_window_blocked: Pipeline.TIMING_REPLACE,
  time_window_preferred: Pipeline.TIMING_REPLACE,
  time_constraint: Pipeline.TIMING_REPLACE,

  // ── content / training (Coach re-plans the week) ──────────────────────────
  disliked_exercise: Pipeline.CONTENT_REPLAN,
  volume_too_high: Pipeline.CONTENT_REPLAN,
  volume_too_low: Pipeline.CONTENT_REPLAN,
  too_hard: Pipeline.CONTENT_REPLAN,
  too_easy: Pipeline.CONTENT_REPLAN,
  no_motivation: Pipeline.CONTENT_REPLAN,
  diversity_request: Pipeline.CONTENT_REPLAN,
  volume_bias: Pipeline.CONTENT_REPLAN,
  intensity_bias: Pipeline.CONTENT_REPLAN,
  modality_pref: Pipeline.CONTENT_REPLAN,
  exercise_override: Pipeline.CONTENT_REPLAN,
  exercise_prescription: Pipeline.CONTENT_REPLAN,
  equipment_removed: Pipeline.CONTENT_REPLAN,
  equipment_added: Pipeline.CONTENT_REPLAN,
  session_duration: Pipeline.CONTENT_REPLAN, // duration is Coach-owned content
  sessions_per_week: Pipeline.CONTENT_REPLAN,
  weekly_km: Pipeline.CONTENT_REPLAN,
  run_type_pref: Pipeline.CONTENT_REPLAN,
  split_preference: Pipeline.CONTENT_REPLAN,
  exercises_per_session: Pipeline.CONTENT_REPLAN,
  default_sets: Pipeline.CONTENT_REPLAN,
  default_reps: Pipeline.CONTENT_REPLAN,
  muscle_group_pref: Pipeline.CONTENT_REPLAN,
  experience_level: Pipeline.CONTENT_REPLAN,

  // ── transient / no current-week impact ────────────────────────────────────
  weather: Pipeline.WRITE_ONLY,
  travel: Pipeline.WRITE_ONLY,
  other: Pipeline.WRITE_ONLY,
};

/** The single deterministic routing function. */
export function pipelineForTag(tag: PreferenceTagType): Pipeline {
  return TAG_PIPELINE_TABLE[tag] ?? Pipeline.WRITE_ONLY;
}
