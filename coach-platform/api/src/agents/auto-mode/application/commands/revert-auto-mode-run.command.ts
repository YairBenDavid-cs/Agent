export class RevertAutoModeRunCommand {
  constructor(
    public readonly userId: string,
    public readonly runId: string,
  ) {}
}

export interface RevertAutoModeRunResult {
  reverted: boolean;
  /** Human-readable reason when `reverted` is false. */
  reason?: string;
}
