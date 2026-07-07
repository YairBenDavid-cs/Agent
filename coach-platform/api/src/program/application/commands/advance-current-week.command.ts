/**
 * Advance the program's "current" pointer to a later week: the prior current
 * week is marked `done`, the target week becomes `current`. Used when a build
 * (scheduled or user-initiated) starts planning a week beyond the one the
 * user is currently training.
 */
export class AdvanceCurrentWeekCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly targetWeekIndex: number,
  ) {}
}

export interface AdvanceCurrentWeekResult {
  advanced: true;
  currentWeekIndex: number;
}
