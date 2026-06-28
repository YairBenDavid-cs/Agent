import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { TagConfidence } from '../../personalization/domain/preference-event.model';
import { Pipeline } from '../orchestrator/pipeline.types';
import { pipelineForTag } from '../orchestrator/tag-routing.table';
import { AssistantLane, AssistantTurn, CapturedSignal } from './assistant.contracts';

/**
 * The deterministic interpretation of a (model-produced) assistant turn. Keeping
 * this PURE and separate from the LLM loop is the point: pipeline selection and
 * the fire-now-vs-defer boundary are code, not model judgment, so they are
 * testable and the guardrails stay centralized.
 */
export interface AssistantActions {
  lane: AssistantLane;
  /** The user-facing message to return. */
  reply: string;
  /** Preference events to write eagerly (append-only; never lost). */
  writes: PreferenceItemDto[];
  /** True when writes are inferred/batched (reinforcement only — never fires). */
  inferred: boolean;
  /** The single pipeline to enqueue now, or null (eager-write only / query). */
  pipeline: Pipeline | null;
  /** True when we asked a grounded question and are awaiting the user's reply. */
  awaitingConfirmation: boolean;
}

/** Tags that bypass the firing boundary and always re-plan immediately. */
const SAFETY_TAGS = new Set(['injury_or_illness', 'injury']);

/**
 * Higher = more comprehensive. When a turn captures several signals that each
 * want a pipeline, we run the single strongest one (one re-plan per turn).
 */
const PIPELINE_PRECEDENCE: Record<Pipeline, number> = {
  [Pipeline.PROGRAM_GENERATION]: 5,
  [Pipeline.SAFETY_REPLAN]: 4,
  [Pipeline.FULL_SESSION_DAY]: 3,
  [Pipeline.CONTENT_REPLAN]: 2,
  [Pipeline.TIMING_REPLACE]: 1,
  [Pipeline.WRITE_ONLY]: 0,
};

export function decideActions(
  turn: AssistantTurn,
  today: string,
): AssistantActions {
  if (turn.lane === 'white') {
    return base(turn, [], false, null, false);
  }

  if (turn.lane === 'gray') {
    // A grounded question pending the user's confirmation: write nothing yet.
    if (turn.clarifyingQuestion) {
      return base(turn, [], false, null, true);
    }
    // No confirmation → demote to inferred + batched; reinforcement only.
    const writes = turn.captured.map((s) => toItem(s, today, 'inferred'));
    return base(turn, writes, true, null, false);
  }

  // black: explicit order → eager explicit write + (maybe) fire now.
  const writes = turn.captured.map((s) => toItem(s, today, 'explicit'));
  const pipeline = selectPipeline(turn.captured);
  return base(turn, writes, false, pipeline, false);
}

/**
 * Pick the one pipeline to fire for an explicit turn, or null to only write.
 * Safety tags fire regardless of week scope; everything else fires only when the
 * change touches the week the user is about to train.
 */
export function selectPipeline(signals: CapturedSignal[]): Pipeline | null {
  let best: Pipeline | null = null;

  for (const s of signals) {
    const isSafety = SAFETY_TAGS.has(s.tagType);
    if (!isSafety && !s.affectsCurrentWeek) {
      continue; // future-only standing pref: write now, regenerate later.
    }
    const pipeline = pipelineForTag(s.tagType);
    if (pipeline === Pipeline.WRITE_ONLY) {
      continue;
    }
    if (best === null || PIPELINE_PRECEDENCE[pipeline] > PIPELINE_PRECEDENCE[best]) {
      best = pipeline;
    }
  }

  return best;
}

function toItem(
  s: CapturedSignal,
  today: string,
  confidence: TagConfidence,
): PreferenceItemDto {
  const target =
    s.target &&
    (s.target.plannedSessionId || s.target.exerciseId || s.target.runType)
      ? {
          plannedSessionId: s.target.plannedSessionId ?? null,
          exerciseId: s.target.exerciseId ?? null,
          runType: s.target.runType ?? null,
        }
      : null;

  return {
    eventDate: today,
    discipline: s.discipline,
    scope: s.scope,
    durability: s.durability,
    expiresAt: null,
    target,
    tag: {
      type: s.tagType,
      value: s.value,
      polarity: s.polarity,
      confidence,
    },
    rawText: s.rawText,
  };
}

function base(
  turn: AssistantTurn,
  writes: PreferenceItemDto[],
  inferred: boolean,
  pipeline: Pipeline | null,
  awaitingConfirmation: boolean,
): AssistantActions {
  return {
    lane: turn.lane,
    reply: turn.reply,
    writes,
    inferred,
    pipeline,
    awaitingConfirmation,
  };
}
