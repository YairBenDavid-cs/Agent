export class RevertAutoModeRunCommand {
  constructor(
    public readonly userId: string,
    public readonly runId: string,
    /**
     * `allowAbortedOrFailed` is the orchestrator's auto-revert path: a run
     * that stopped mid-change (aborted with writes, or crashed) may be
     * restored from its beforeSnapshot even though it never committed. The
     * run's status/failure reason are left untouched in that case.
     */
    public readonly opts: { allowAbortedOrFailed?: boolean } = {},
  ) {}
}

export interface RevertAutoModeRunResult {
  reverted: boolean;
  /** Human-readable reason when `reverted` is false. */
  reason?: string;
}
