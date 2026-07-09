import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { ConversationMode } from '../conversation/domain/conversation.model';
import {
  Pipeline,
  SessionEditRequest,
  SessionRescheduleRequest,
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
  /** Multi-session variant of `sessionEdit` (same change, several sessions). */
  sessionEdits?: SessionEditRequest[];
  targetRevision?: TargetRevisionRequest;
  sessionReschedule?: SessionRescheduleRequest;
}

/**
 * Deterministic ground truth for verifying the model's breach judgment on a
 * session_content_edit. Assembled by the caller from the targeted week's locked
 * targets + per-session native volumes (km for running, volume-load for
 * strength). Null/absent → verification is skipped (model judgment stands).
 */
export interface WeekBreachFacts {
  /** The week's locked total-volume budget, or null when nothing is locked. */
  lockedTotalVolume: number | null;
  /** Current native volume per plannedSessionId. */
  sessionVolumes: Record<string, number>;
}

/** Relative tolerance before a volume delta counts as a locked-target breach. */
const BREACH_TOLERANCE = 0.1;

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
  [Pipeline.SESSION_RESCHEDULE]: 1.5,
  [Pipeline.TIMING_REPLACE]: 1,
  [Pipeline.WRITE_ONLY]: 0,
};

export function decideActions(
  turn: AssistantTurn,
  today: string,
  mode: ConversationMode = 'plan',
  weekFacts: WeekBreachFacts | null = null,
): AssistantActions {
  // ASK mode is a hard read-only boundary: regardless of lane, write nothing and
  // fire nothing. A non-white turn (including an unconfirmed/confirmed weekEdit)
  // means the user asked to change something — flag it so the caller can nudge
  // them to switch to Plan mode.
  if (mode === 'ask') {
    const blocked = turn.lane !== 'white' || turn.weekEdit != null;
    return base(turn, [], false, null, false, blocked);
  }

  // A white-labeled turn with NO week edit is pure conversation: nothing to
  // write, nothing to fire. But a confirmed weekEdit on a white turn is a lane
  // misclassification, not a no-op — the user explicitly asked to change the
  // plan and the model built the edit payload. Honor the edit (fall through to
  // the black-lane handling below, which writes nothing extra since captured
  // is empty on a genuine white turn) rather than silently discarding it and
  // letting the caller emit a false "missing details" failure.
  if (turn.lane === 'white' && !turn.weekEdit?.confirmed) {
    return base(turn, [], false, null, false);
  }

  // Deterministic breach verification: if the code's own math says a confirmed
  // session edit breaches the locked targets but the model declared no breach
  // (so the user never confirmed a cascade), fail closed — fire nothing and
  // ask for the go-ahead with the numbers attached.
  const unverifiedBreach = detectUnhandledBreach(turn.weekEdit, weekFacts);
  if (unverifiedBreach) {
    const asked = { ...turn, reply: `${turn.reply}\n\n${unverifiedBreach}` };
    return base(asked, [], false, null, true);
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

  // A confirmed week edit that FAILED to resolve (missing plannedSessionId /
  // newTargets / move payload) must fail closed entirely: never fall back to a
  // broader captured-signal pipeline. Firing CONTENT_REPLAN off a malformed
  // single-session edit would regenerate the whole week the user asked to
  // touch one session of. The caller corrects the done-tense reply. A safety
  // signal on the same turn is the one exception — it always fires.
  if (turn.weekEdit?.confirmed && resolved === null) {
    const safetyOnly =
      signalPipeline === Pipeline.SAFETY_REPLAN ? signalPipeline : null;
    return base(turn, writes, false, safetyOnly, false);
  }

  const pipeline = strongerPipeline(signalPipeline, resolved?.pipeline ?? null);
  const weekEditContext =
    pipeline !== null && pipeline === resolved?.pipeline ? resolved.context : null;
  return base(turn, writes, false, pipeline, false, false, weekEditContext);
}

/**
 * Explain, in model-facing terms, why a CONFIRMED week edit cannot fire —
 * i.e. exactly which required field its kind is missing and how to fix it.
 * Returns null when the edit is absent, unconfirmed, or complete.
 *
 * Thrown from the `assistant_turn` handler so the agentic loop's
 * validator-bounce feeds it back and the model corrects itself IN the same
 * turn (look up the id, re-call the tool) instead of the turn dying in the
 * fail-closed "missing details" reply downstream. Keep the checks in lockstep
 * with `resolveWeekEditPipeline` below.
 */
export function describeIncompleteWeekEdit(edit: WeekEdit | null): string | null {
  if (!edit || !edit.confirmed) {
    return null;
  }

  const lookupHint =
    `Call query_planned_sessions for week ${edit.weekIndex} to find the ` +
    'exact session (match on date and title), then call assistant_turn ' +
    'again with the SAME weekEdit plus the missing field filled in. Do not ' +
    'drop the weekEdit.';

  if (edit.kind === 'session_reschedule') {
    if (!edit.plannedSessionId) {
      return `weekEdit is a confirmed session_reschedule but plannedSessionId is null. ${lookupHint}`;
    }
    if (!edit.newDate && !edit.newStartTime) {
      return (
        'weekEdit is a confirmed session_reschedule but both newDate and ' +
        'newStartTime are null — set at least one, then call assistant_turn again.'
      );
    }
    return null;
  }

  if (edit.kind === 'session_content_edit') {
    if (!edit.plannedSessionId && edit.plannedSessionIds.length === 0) {
      return `weekEdit is a confirmed session_content_edit but plannedSessionId is null and plannedSessionIds is empty. ${lookupHint}`;
    }
    return null;
  }

  // target_revision
  if (!edit.newTargets) {
    return (
      'weekEdit is a confirmed target_revision but newTargets is null — fill ' +
      'newTargets with the FULL replacement weekly budget (sessionCount, ' +
      'totalVolume, keyGoals), then call assistant_turn again.'
    );
  }
  return null;
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

  if (edit.kind === 'session_reschedule') {
    // Deterministic move: needs the session and at least one of date/time.
    if (!edit.plannedSessionId || (!edit.newDate && !edit.newStartTime)) {
      return null;
    }
    const sessionReschedule: SessionRescheduleRequest = {
      plannedSessionId: edit.plannedSessionId,
      newDate: edit.newDate ?? null,
      newStartTime: edit.newStartTime ?? null,
    };
    return {
      pipeline: Pipeline.SESSION_RESCHEDULE,
      context: { weekIndex: edit.weekIndex, sessionReschedule },
    };
  }

  if (edit.kind === 'session_content_edit') {
    const ids = dedupe([
      ...(edit.plannedSessionId ? [edit.plannedSessionId] : []),
      ...edit.plannedSessionIds,
    ]);
    if (ids.length === 0) {
      return null;
    }
    const revisedTargets =
      edit.breachesLockedTargets && edit.newTargets ? edit.newTargets : null;
    const sessionEdits: SessionEditRequest[] = ids.map((id, i) => ({
      plannedSessionId: id,
      requestedChangeDescription: edit.requestedChangeDescription,
      // The target cascade (if any) rides on the first edit only — the saga
      // revises the week's locked targets once, then redrafts each session.
      revisedTargets: i === 0 ? revisedTargets : null,
    }));
    return {
      pipeline: Pipeline.SESSION_CONTENT_REPLAN,
      context: {
        weekIndex: edit.weekIndex,
        sessionEdit: sessionEdits[0],
        sessionEdits,
      },
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

/**
 * Code-side verification of the model's breach judgment. Returns a user-facing
 * confirmation note when the math says a confirmed session_content_edit would
 * push the week outside its locked total-volume budget (±10%) but the model
 * declared `breachesLockedTargets: false` (or supplied no replacement targets)
 * — i.e. the user never confirmed the cascade. Null when no verification is
 * possible or the edit is within budget.
 */
export function detectUnhandledBreach(
  edit: WeekEdit | null,
  facts: WeekBreachFacts | null,
): string | null {
  if (
    !edit ||
    !edit.confirmed ||
    edit.kind !== 'session_content_edit' ||
    edit.newSessionVolume == null ||
    !facts ||
    facts.lockedTotalVolume == null ||
    facts.lockedTotalVolume <= 0
  ) {
    return null;
  }
  // The model already flagged the breach AND carries replacement targets → the
  // user confirmed the cascade; nothing to intercept.
  if (edit.breachesLockedTargets && edit.newTargets) {
    return null;
  }

  const editedIds = new Set(
    [
      ...(edit.plannedSessionId ? [edit.plannedSessionId] : []),
      ...edit.plannedSessionIds,
    ].filter((id) => id in facts.sessionVolumes),
  );
  if (editedIds.size === 0) {
    return null;
  }

  let newTotal = 0;
  for (const [id, volume] of Object.entries(facts.sessionVolumes)) {
    newTotal += editedIds.has(id) ? edit.newSessionVolume : volume;
  }

  const budget = facts.lockedTotalVolume;
  if (Math.abs(newTotal - budget) / budget <= BREACH_TOLERANCE) {
    return null;
  }

  const direction = newTotal > budget ? 'above' : 'below';
  return (
    `Heads up — this change would put the week at ${round1(newTotal)} total ` +
    `volume, which is ${direction} the locked target of ${round1(budget)}. ` +
    `Applying it means revising the week's goals too. Want me to go ahead ` +
    `with both?`
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
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
