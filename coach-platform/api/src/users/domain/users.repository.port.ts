import { UserProfile } from './user.model';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepositoryPort {
  create(profile: UserProfile): Promise<void>;
  findById(userId: string): Promise<UserProfile | null>;
  findByEmail(email: string): Promise<UserProfile | null>;
  /** All active users — used by the ingestion scheduler to enumerate tenants. */
  findActiveIds(): Promise<string[]>;
}
