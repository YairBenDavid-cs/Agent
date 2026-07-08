/**
 * Audit + orchestration record for one autonomous AutoModeGraph execution.
 * Mirrors `ScheduledWeekBuild`'s role: agent-layer bookkeeping, not a domain
 * resource. The run's own `id` doubles as the value written into
 * `ProgramWeek.runLockId` — holding the lock IS holding a live run record.
 */

/** The 4 auto-mode capabilities the orchestrator routes between. */
export type AutoModeScenario =
  | 'new_week'
  | 'weekly_targets_edit'
  | 'session_edit'
  | 'session_time_edit';

export type AutoModeTrigger = 'chat' | 'scheduled_rollover' | 'manual_trigger';

export type AutoModeRunStatus = 'running' | 'committed' | 'aborted' | 'failed';

/**
 * One step of the orchestrator/agent chain-of-thought, in call order. Doubles
 * as both the debugging trace and the raw material for the end-of-run
 * "verbose explanation" message (hard constraint #4).
 */
export interface AutoModeTraceEntry {
  node: string; // 'route' | 'coach' | 'recovery' | 'debate' | 'guardrail' | 'planner' | 'commit' | 'abort'
  at: string; // ISO timestamp
  summary: string; // short natural-language decision/result summary
}

/**
 * Structured before/after diff surfaced in chat at commit time. Kept generic
 * (unknown-shaped per section) since the 4 scenarios touch different slices
 * of state; `auto-mode-explanation.builder.ts` renders whichever sections are
 * populated.
 */
export interface AutoModeDiff {
  weeklyTargets?: { before: unknown; after: unknown };
  sessions?: Array<{ sessionId: string; before: unknown; after: unknown }>;
  schedule?: Array<{
    sessionId: string;
    before: { date: string; startTime: string } | null;
    after: { date: string; startTime: string } | null;
  }>;
}

export interface AutoModeRun {
  id: string;
  userId: string;
  programId: string;
  weekIndex: number;
  scenario: AutoModeScenario;
  trigger: AutoModeTrigger;
  /** The conversation the run reports into — always set; auto-created if none was open. */
  conversationId: string;
  status: AutoModeRunStatus;
  trace: AutoModeTraceEntry[];
  /** Pre-change snapshot, replayed as compensating commands by revert. */
  beforeSnapshot: unknown;
  diff: AutoModeDiff | null;
  failureReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
