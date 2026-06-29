import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { ConversationMode } from '../conversation/domain/conversation.model';
import { Pipeline } from '../orchestrator/pipeline.types';
import { pipelineForTag } from '../orchestrator/tag-routing.table';
import { AssistantLane, AssistantTurn, CapturedSignal } from './assistant.contracts';
import { signalToPreferenceItem } from './assistant.mapping';

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
  /**
   * True when the user expressed a mutation in ASK mode: we wrote nothing and
   * fired nothing, and the caller should surface a "switch to Plan mode" hint.
   */
  intentBlocked: boolean;
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
  mode: ConversationMode = 'plan',
): AssistantActions {
  // ASK mode is a hard read-only boundary: regardless of lane, write nothing and
  // fire nothing. A non-white turn means the user asked to change something —
  // flag it so the caller can nudge them to switch to Plan mode.
  if (mode === 'ask') {
    return base(turn, [], false, null, false, turn.lane !== 'white');
  }

  if (turn.lane === 'white') {
    return base(turn, [], false, null, false);
  }

  if (turn.lane === 'gray') {
    // A grounded question pending the user's confirmation: write nothing yet.
    if (turn.clarifyingQuestion) {
      return base(turn, [], false, null, true);
    }
    // No confirmation → demote to inferred + batched; reinforcement only.
    const writes = turn.captured.map((s) =>
      signalToPreferenceItem(s, today, 'inferred'),
    );
    return base(turn, writes, true, null, false);
  }

  // black: explicit order → eager explicit write + (maybe) fire now.
  const writes = turn.captured.map((s) =>
    signalToPreferenceItem(s, today, 'explicit'),
  );
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

function base(
  turn: AssistantTurn,
  writes: PreferenceItemDto[],
  inferred: boolean,
  pipeline: Pipeline | null,
  awaitingConfirmation: boolean,
  intentBlocked = false,
): AssistantActions {
  return {
    lane: turn.lane,
    reply: turn.reply,
    writes,
    inferred,
    pipeline,
    awaitingConfirmation,
    intentBlocked,
  };
}
