/**
 * Step A commit for a single program week: freeze the weekly macro budget
 * (session count / total volume / key goals) and flip the week to
 * `targets_locked`. Per-session drafting (Step B) then runs inside this quota,
 * and the `validateAgainstWeeklyTargets` guardrail bounces any draft that
 * overshoots it.
 *
 * Targets are IMMUTABLE once locked: re-locking a week that is already
 * `targets_locked` or `locked` is rejected (the caller must re-plan via a
 * reactive edit instead of silently rewriting a frozen quota).
 */
export class LockWeeklyTargetsCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
    public readonly sessionCount: number,
    public readonly totalVolume: number,
    public readonly keyGoals: string[],
    public readonly lockedAt: string, // ISO timestamp
  ) {}
}

export interface LockWeeklyTargetsResult {
  locked: true;
  weekIndex: number;
}
