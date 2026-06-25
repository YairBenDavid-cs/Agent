import { TrainingProfile } from './training-profile.model';

/** DI token for the training-profile repository port (DIP). */
export const TRAINING_PROFILE_REPOSITORY = Symbol(
  'TRAINING_PROFILE_REPOSITORY',
);

/**
 * Domain-facing persistence contract. Tenant-scoped by userId. The design keeps
 * a single 'active' profile per user while archiving prior ones as 'completed',
 * so re-onboarding never destroys history.
 */
export interface TrainingProfileRepositoryPort {
  /** The caller's current active profile, or null if they haven't onboarded. */
  findActive(userId: string): Promise<TrainingProfile | null>;

  /**
   * Archives any existing active profile (status -> 'completed') and inserts the
   * given one as the new active profile. Atomic when run inside a transaction.
   */
  replaceActive(profile: TrainingProfile): Promise<void>;
}
