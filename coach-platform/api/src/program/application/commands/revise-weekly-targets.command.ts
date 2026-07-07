/**
 * Reactive-edit primitive for a week whose Step-A targets are already frozen
 * (`targets_locked` or `locked`): revise the macro budget IN PLACE, appending a
 * `WeeklyTargetsRevision` entry so the quota being overwritten is preserved,
 * not silently lost. `weekState` is left untouched — no unlock/relock round-trip.
 *
 * Unlike `LockWeeklyTargetsCommand`, this is rejected on an `open` week (there
 * is no locked quota yet to revise; use `ProposeWeeklyTargetsCommand`/
 * `LockWeeklyTargetsCommand` instead).
 */
export class ReviseWeeklyTargetsCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
    public readonly sessionCount: number,
    public readonly totalVolume: number,
    public readonly keyGoals: string[],
    public readonly reason: string,
    public readonly triggeredBy: 'session_edit' | 'direct_target_change',
  ) {}
}

export interface ReviseWeeklyTargetsResult {
  revised: true;
  weekIndex: number;
}
