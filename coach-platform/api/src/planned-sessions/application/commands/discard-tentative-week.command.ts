/**
 * Drop the tentative draft of a program week. Fired when the user rejects a
 * regenerated week (only legal when a committed fallback exists) or when a
 * user-initiated draft lapses past its TTL. Committed / outcome-bearing trains
 * are never touched.
 */
export class DiscardTentativeWeekCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
  ) {}
}

export interface DiscardTentativeWeekResult {
  discarded: number;
}
