import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { ConversationMode } from '../conversation/domain/conversation.model';
import {
  Pipeline,
  SessionEditRequest,
  TargetRevisionRequest,
} from '../orchestrator/pipeline.types';
import { pipelineForTag } from '../orchestrator/tag-routing.table';
import {
  AssistantLane,
  AssistantTurn,
  CapturedSignal,
  WeekEdit,
} from './assistant.contracts';
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
  /**
   * Resolved week + session/target payload to merge into the pipeline run
   * context, set only when `pipeline` is one of the two week-edit pipelines.
   */
  weekEditContext: WeekEditPipelineContext | null;
  /** True when we asked a grounded question and are awaiting the user's reply. */
  awaitingConfirmation: boolean;
  /**
   * True when the user expressed a mutation in ASK mode: we wrote nothing and
   * fired nothing, and the caller should surface a "switch to Plan mode" hint.
   */
  intentBlocked: boolean;
}

/** The bit of `PipelineRunContext` a confirmed week edit resolves to. */
export interface WeekEditPipelineContext {
  weekIndex: number;
  sessionEdit?: SessionEditRequest;
  targetRevision?: TargetRevisionRequest;
}

/** Tags that bypass the firing boundary and always re-plan immediately. */
const SAFETY_TAGS = new Set(['injury_or_illness', 'injury', 'overreaching']);

/**
 * Higher = more comprehensive. When a turn captures several signals that each
 * want a pipeline, we run the single strongest one (one re-plan per turn).
 */
const PIPELINE_PRECEDENCE: Record<Pipeline, number> = {
  [Pipeline.PROGRAM_GENERATION]: 7,
  [Pipeline.SAFETY_REPLAN]: 6,
  [Pipeline.TARGET_REVISION_REPLAN]: 5,
  [Pipeline.SESSION_CONTENT_REPLAN]: 4,
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
  // fire nothing. A non-white turn (including an unconfirmed/confirmed weekEdit)
  // means the user asked to change something — flag it so the caller can nudge
  // them to switch to Plan mode.
  if (mode === 'ask') {
    const blocked = turn.lane !== 'white' || turn.weekEdit != null;
    return base(turn, [], false, null, false, blocked);
  }

  if (turn.lane === 'white') {
    return base(turn, [], false, null, false);
  }

  if (turn.lane === 'gray') {
    // A grounded question, OR an unconfirmed week-edit breach, pending the
    // user's go-ahead: write and fire nothing yet.
    if (turn.clarifyingQuestion || (turn.weekEdit && !turn.weekEdit.confirmed)) {
      return base(turn, [], false, null, true);
    }
    // No confirmation needed on the captured signals → demote to inferred +
    // batched; reinforcement only. A confirmed week edit can still fire.
    const writes = turn.captured.map((s) =>
      signalToPreferenceItem(s, today, 'inferred'),
    );
    const resolved = resolveWeekEditPipeline(turn.weekEdit);
    return base(
      turn,
      writes,
      true,
      resolved?.pipeline ?? null,
      false,
      false,
      resolved?.context ?? null,
    );
  }

  // black: explicit order → eager explicit write + (maybe) fire now.
  // An unconfirmed week-edit breach still blocks firing (and any write of the
  // cascading edit) even on an otherwise-explicit turn — never ripple silently.
  if (turn.weekEdit && !turn.weekEdit.confirmed) {
    return base(turn, [], false, null, true);
  }

  const writes = turn.captured.map((s) =>
    signalToPreferenceItem(s, today, 'explicit'),
  );
  const signalPipeline = selectPipeline(turn.captured);
  const resolved = resolveWeekEditPipeline(turn.weekEdit);
  const pipeline = strongerPipeline(signalPipeline, resolved?.pipeline ?? null);
  const weekEditContext =
    pipeline !== null && pipeline === resolved?.pipeline ? resolved.context : null;
  return base(turn, writes, false, pipeline, false, false, weekEditContext);
}

/**
 * Map a CONFIRMED week edit onto the pipeline + run-context payload it fires.
 * Returns null for an unconfirmed edit or one missing a field its kind needs
 * (fail closed — a malformed edit fires nothing rather than guessing).
 */
function resolveWeekEditPipeline(
  edit: WeekEdit | null,
): { pipeline: Pipeline; context: WeekEditPipelineContext } | null {
  if (!edit || !edit.confirmed) {
    return null;
  }

  if (edit.kind === 'session_content_edit') {
    if (!edit.plannedSessionId) {
      return null;
    }
    const sessionEdit: SessionEditRequest = {
      plannedSessionId: edit.plannedSessionId,
      requestedChangeDescription: edit.requestedChangeDescription,
      revisedTargets:
        edit.breachesLockedTargets && edit.newTargets ? edit.newTargets : null,
    };
    return {
      pipeline: Pipeline.SESSION_CONTENT_REPLAN,
      context: { weekIndex: edit.weekIndex, sessionEdit },
    };
  }

  if (!edit.newTargets) {
    return null;
  }
  const targetRevision: TargetRevisionRequest = {
    newTargets: edit.newTargets,
    reason: edit.rationale,
  };
  return {
    pipeline: Pipeline.TARGET_REVISION_REPLAN,
    context: { weekIndex: edit.weekIndex, targetRevision },
  };
}

/** The higher-precedence of two pipelines (either may be null). */
function strongerPipeline(
  a: Pipeline | null,
  b: Pipeline | null,
): Pipeline | null {
  if (!a) return b;
  if (!b) return a;
  return PIPELINE_PRECEDENCE[a] >= PIPELINE_PRECEDENCE[b] ? a : b;
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
  weekEditContext: WeekEditPipelineContext | null = null,
): AssistantActions {
  return {
    lane: turn.lane,
    reply: turn.reply,
    writes,
    inferred,
    pipeline,
    weekEditContext,
    awaitingConfirmation,
    intentBlocked,
  };
}
