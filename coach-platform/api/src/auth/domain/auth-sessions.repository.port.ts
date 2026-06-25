import { AuthSession } from './auth-session.model';

export const AUTH_SESSIONS_REPOSITORY = Symbol('AUTH_SESSIONS_REPOSITORY');

export interface AuthSessionsRepositoryPort {
  create(session: AuthSession): Promise<void>;
  findByJti(jti: string): Promise<AuthSession | null>;
  /** Idempotently revoke a single session (rotation / logout). */
  revokeByJti(jti: string, revokedAt: string): Promise<void>;
  /** Revoke every active session for a user (reuse-detected theft / global logout). */
  revokeAllForUser(userId: string, revokedAt: string): Promise<void>;
}
