import { AuthCredentials } from './auth-credentials.model';

export const AUTH_CREDENTIALS_REPOSITORY = Symbol('AUTH_CREDENTIALS_REPOSITORY');

export interface AuthCredentialsRepositoryPort {
  /** Insert a new credential. Enrolls in the ambient transaction if present. */
  create(credentials: AuthCredentials): Promise<void>;
  findByUserId(userId: string): Promise<AuthCredentials | null>;
}
