/** Per-run tallies. `*Written` count rows that actually changed (content_hash
 * idempotency skips no-op writes), so a re-run of unchanged data reports zeros. */
export interface IngestionSummary {
  userId: string;
  from: string;
  to: string;
  daysProcessed: number;
  recoveryWritten: number;
  performanceWritten: number;
  sessionsWritten: number;
  profileChangesAppended: number;
  /** Days the fetch service flagged as partial or failed. */
  daysWithIssues: number;
}
