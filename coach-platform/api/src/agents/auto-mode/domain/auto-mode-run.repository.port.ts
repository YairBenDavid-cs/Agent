import {
  AutoModeDiff,
  AutoModeRun,
  AutoModeScenario,
  AutoModeTrigger,
} from './auto-mode-run.model';

export const AUTO_MODE_RUN_REPOSITORY = Symbol('AUTO_MODE_RUN_REPOSITORY');

export interface NewAutoModeRun {
  userId: string;
  programId: string;
  weekIndex: number;
  scenario: AutoModeScenario;
  trigger: AutoModeTrigger;
  conversationId: string;
  beforeSnapshot: unknown;
}

/**
 * Persistence for AutoModeRun — agent-layer bookkeeping (like
 * `ScheduledWeekBuildRepositoryPort`), not a domain resource. Tenant-scoped
 * reads/writes serve user-facing history + revert; one cross-tenant sweep
 * query serves the lock-TTL reaper.
 */
export interface AutoModeRunRepositoryPort {
  create(input: NewAutoModeRun): Promise<AutoModeRun>;

  findByIdScoped(userId: string, id: string): Promise<AutoModeRun | null>;

  /** This user's most recent runs, newest first — history/revert UI. */
  findRecent(userId: string, limit: number): Promise<AutoModeRun[]>;

  /** Append one trace entry (chain-of-thought / node result) to a run. */
  appendTrace(id: string, entry: { node: string; summary: string }): Promise<void>;

  markStarted(id: string): Promise<void>;

  markCommitted(id: string, diff: AutoModeDiff): Promise<void>;

  markAborted(id: string, reason: string): Promise<void>;

  markFailed(id: string, reason: string): Promise<void>;

  /**
   * All `running` runs older than `olderThanMs`, across users — the lock-TTL
   * reaper's input. A run stuck in `running` past the TTL means its process
   * died mid-graph; the reaper fails it and releases its week lock.
   */
  findStaleRunning(olderThanMs: number, limit: number): Promise<AutoModeRun[]>;
}
