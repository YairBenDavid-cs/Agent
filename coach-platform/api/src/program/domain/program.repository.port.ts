import { Program, WeeklyTargets, WeeklyTargetsRevision } from './program.model';

/** DI token for the program repository port (DIP). */
export const PROGRAM_REPOSITORY = Symbol('PROGRAM_REPOSITORY');

/**
 * Domain-facing persistence contract. Tenant-scoped by userId. Keeps a single
 * 'active' program per user; prior ones are archived as 'completed'/'abandoned'
 * so program history is preserved without a future migration.
 */
export interface ProgramRepositoryPort {
  /** The caller's current active program, or null if none exists yet. */
  findActive(userId: string): Promise<Program | null>;

  /** Fetch a specific program owned by the caller. */
  findById(userId: string, programId: string): Promise<Program | null>;

  /**
   * Archives any existing active program (status -> 'completed') and inserts the
   * given one as the new active program. Atomic when run inside a transaction.
   * Returns the new program's id.
   */
  replaceActive(program: Program): Promise<string>;

  /** Replace the `weeks[]` skeleton (e.g. after promoting/regenerating a week). */
  updateWeeks(
    userId: string,
    programId: string,
    weeks: Program['weeks'],
    currentWeekIndex: number,
  ): Promise<void>;

  /**
   * Stage a *tentative* Step-A proposal on one week: stamp its `weeklyTargets`
   * with `lockedAt=null` while leaving `weekState='open'`. This is the
   * conversational-build pre-lock state — the coach proposes a quota the user
   * can still revise. Overwrites any prior tentative proposal on the same week.
   */
  proposeWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: Omit<WeeklyTargets, 'lockedAt'>,
  ): Promise<void>;

  /**
   * Freeze Step A on one week: stamp its `weeklyTargets` quota and flip
   * `weekState` to 'targets_locked'. Targeted update on the matching week entry.
   */
  lockWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: WeeklyTargets,
  ): Promise<void>;

  /**
   * Revise a `targets_locked`/`locked` week's quota IN PLACE — `weekState` is
   * left untouched (no unlock/relock round-trip). Appends `revision` to the
   * week's `revisionHistory` so the prior quota is preserved, not overwritten.
   * Used by the reactive-edit path (session overflow or a direct target
   * change), never by first-time locking.
   */
  reviseWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: Pick<WeeklyTargets, 'sessionCount' | 'totalVolume' | 'keyGoals'>,
    revision: WeeklyTargetsRevision,
  ): Promise<void>;

  /**
   * Atomically acquire (lock != null) or release (lock == null) the
   * autonomous-run lock on one week. Acquisition only succeeds if the week is
   * currently unlocked or already held by the same runId (idempotent retry);
   * it fails (returns false) if another run holds it. Release only succeeds
   * if the caller's runId matches the current holder. This is the mutual-
   * exclusion boundary between AutoModeGraph runs and manual edits/other runs.
   */
  setWeekRunLock(
    userId: string,
    programId: string,
    weekIndex: number,
    lock: { runId: string; lockedAt: string } | null,
    expectedRunId?: string,
  ): Promise<boolean>;
}
