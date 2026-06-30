/**
 * Step-A *proposal* for a single program week: stage a tentative weekly macro
 * budget (session count / total volume / key goals) WITHOUT locking it. The week
 * stays `open` and `weeklyTargets.lockedAt` is null, so the conversational build
 * can surface the proposal for the user to accept or revise. Locking happens
 * separately via {@link LockWeeklyTargetsCommand} once the user consents.
 *
 * Re-proposing while the week is still `open` overwrites the prior proposal (the
 * coach revised it); a week that is already `targets_locked`/`locked` is refused.
 */
export class ProposeWeeklyTargetsCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
    public readonly sessionCount: number,
    public readonly totalVolume: number,
    public readonly keyGoals: string[],
  ) {}
}

export interface ProposeWeeklyTargetsResult {
  proposed: true;
  weekIndex: number;
}
