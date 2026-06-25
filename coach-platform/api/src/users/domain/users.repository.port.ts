import { UserProfilePatch } from '../application/commands/update-user-profile.command';
import { UserProfile } from './user.model';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepositoryPort {
  create(profile: UserProfile): Promise<void>;
  findById(userId: string): Promise<UserProfile | null>;
  findByEmail(email: string): Promise<UserProfile | null>;
  /** All active users — used by the ingestion scheduler to enumerate tenants. */
  findActiveIds(): Promise<string[]>;
  /**
   * Patch a narrow set of profile fields (used by onboarding). Returns false if
   * no user matched. Enrolls in the ambient transaction when one is active.
   */
  updateProfileFields(
    userId: string,
    patch: UserProfilePatch,
  ): Promise<boolean>;
}
