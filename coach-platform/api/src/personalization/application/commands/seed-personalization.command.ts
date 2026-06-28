/**
 * Dev/demo seed: populate one user's semantic log with a representative spread of
 * preference signals (a thrice-repeated inferred dislike that crosses the
 * promotion threshold, an explicit blocked time window, a volume bias, a modality
 * lean, and an injury), then rebuild the projection. Idempotency is NOT a goal —
 * re-running simply appends more events (the log is append-only by design).
 */
export class SeedPersonalizationCommand {
  constructor(public readonly userId: string) {}
}
