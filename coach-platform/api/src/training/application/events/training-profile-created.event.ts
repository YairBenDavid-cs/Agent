/** Event name for the onboarding-submit completion seam. */
export const TRAINING_PROFILE_CREATED = 'training.profile.created';

/**
 * Fired after a training profile is saved (the transaction has committed). The
 * agents layer listens for this to auto-generate a first program — kept as an
 * event so the training context stays decoupled from the reasoning tier.
 */
export class TrainingProfileCreatedEvent {
  constructor(public readonly payload: { userId: string }) {}
}
