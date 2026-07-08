import { Annotation } from '@langchain/langgraph';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { ReadinessBand } from '../coach/coach.guardrails';
import { RecoveryVerdict } from '../recovery/recovery.contracts';
import {
  AutoModeDiff,
  AutoModeRunStatus,
  AutoModeScenario,
  AutoModeTraceEntry,
  AutoModeTrigger,
} from './domain/auto-mode-run.model';

/** The athlete's ask for a `weekly_targets_edit` run — omitted fields keep the locked value. */
export interface WeeklyTargetsEditRequest {
  sessionCount?: number;
  totalVolume?: number;
  keyGoals?: string[];
  reason: string;
}

/** The athlete's ask for a `session_edit` run. */
export interface SessionEditRequest {
  plannedSessionId: string;
  requestedChangeDescription: string;
}

/** The athlete's ask for a `session_time_edit` run — an explicit slot, or none (auto-pick). */
export interface SessionTimeEditRequest {
  plannedSessionId: string;
  requestedDate?: string | null;
  requestedStartTime?: string | null;
}

/** One committed session's content diff, staged during a cascade for the final explanation. */
export interface SessionChange {
  sessionId: string;
  before: unknown;
  after: unknown;
}

/**
 * Shared LangGraph state for the whole AutoModeGraph. Scalars are last-write
 * wins (no reducer); `trace` and `sessionChanges` accumulate across nodes so
 * every step's chain-of-thought survives to the final explanation.
 */
export const AutoModeState = Annotation.Root({
  runId: Annotation<string>,
  userId: Annotation<string>,
  programId: Annotation<string>,
  weekIndex: Annotation<number>,
  discipline: Annotation<EventDiscipline>,
  timezone: Annotation<string>,
  scenario: Annotation<AutoModeScenario>,
  trigger: Annotation<AutoModeTrigger>,
  conversationId: Annotation<string>,
  weekWindow: Annotation<{ from: string; to: string }>,

  weeklyTargetsEditRequest: Annotation<WeeklyTargetsEditRequest | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  sessionEditRequest: Annotation<SessionEditRequest | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  sessionTimeEditRequest: Annotation<SessionTimeEditRequest | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),

  recoveryVerdict: Annotation<RecoveryVerdict | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  readinessBand: Annotation<ReadinessBand | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  debateRound: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  guardrailViolations: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  trace: Annotation<AutoModeTraceEntry[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  sessionChanges: Annotation<SessionChange[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  diff: Annotation<AutoModeDiff>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  /**
   * Flipped to true by any node the moment a persisting call has succeeded
   * (targets revision, session-content rewrite, schedule upsert). An abort
   * with `writesPerformed === true` means the run stopped MID-change, so the
   * orchestrator must revert and the explanation must not claim nothing
   * happened.
   */
  writesPerformed: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  status: Annotation<AutoModeRunStatus>({
    reducer: (_left, right) => right,
    default: () => 'running',
  }),
  abortReason: Annotation<string | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
});

export type AutoModeGraphState = typeof AutoModeState.State;
export type AutoModeGraphUpdate = typeof AutoModeState.Update;
