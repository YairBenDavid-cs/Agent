import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { PlacementReport } from '../planner/planner.contracts';
import { RecoveryVerdict } from '../recovery/recovery.contracts';

/**
 * The fixed catalog of pipelines. The orchestrator always runs the MINIMAL
 * sufficient one; pipelines 2–4 are entry-point subsets of pipeline 1 (same
 * agents/stages, skipping what the change doesn't touch). Selection is
 * deterministic (a tag → pipeline table), never an LLM judgment.
 */
export enum Pipeline {
  /** 1. Scheduled session-day: Recovery gate → Coach revise → Planner place. */
  FULL_SESSION_DAY = 'full_session_day',
  /** 2. Injury/illness / low-readiness: Recovery → Coach (whole week) → Planner. */
  SAFETY_REPLAN = 'safety_replan',
  /** 3. Content/training change: Coach (whole week) → Planner. */
  CONTENT_REPLAN = 'content_replan',
  /** 4. Timing-only change: Planner re-place (no Coach). */
  TIMING_REPLACE = 'timing_replace',
  /** 5. Program start / major goal change: Coach skeleton → week 1 → Planner. */
  PROGRAM_GENERATION = 'program_generation',
  /** 6. No current-week impact: write event + rebuild projection, no agents. */
  WRITE_ONLY = 'write_only',
}

/** Everything a pipeline run needs. Assembled deterministically by the caller. */
export interface PipelineRunContext {
  userId: string;
  /** Stable id for idempotency + correlation across stages/retries. */
  runId: string;
  discipline: EventDiscipline;
  timezone: string;
  /** Inclusive local date window of the week under work. */
  weekWindow: { from: string; to: string };
  /** Target skeleton week; defaults to the program's currentWeekIndex. */
  weekIndex?: number;
}

export interface PipelineRunResult {
  pipeline: Pipeline;
  status: 'completed' | 'aborted';
  /** Stage names actually executed, in order. */
  stages: string[];
  recoveryVerdict: RecoveryVerdict | null;
  placement: PlacementReport | null;
  abortReason?: string;
  /**
   * True when a NEWER run for the same user+week was enqueued before this one
   * finished. The pending card this run produced is stale and must be
   * invalidated rather than shown for approval (supersession; Phase 9).
   */
  superseded?: boolean;
}
