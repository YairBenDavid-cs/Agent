/**
 * Approval commit for a whole program week: flip every still-`tentative` train
 * of `(programId, weekIndex)` to `committed`. Fired when the user approves the
 * generated week's per-session cards. App-side only — the Google Calendar events
 * are synced separately (by the agent tier's CalendarSyncService) once the
 * commit lands. Idempotent: re-approving a committed week flips nothing.
 */
export class CommitWeekCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
  ) {}
}

export interface CommitWeekResult {
  committed: number;
}
