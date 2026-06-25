import { createContext } from 'react';
import type { User } from '@/shared/types/user';

export interface AuthContextValue {
  /** The signed-in user, or null when logged out. */
  user: User | null;
  /** True until the initial session check (GET /users/me) resolves. */
  loading: boolean;
  /** Record a successful login/signup. */
  login: (user: User) => void;
  /** Revoke the server session and clear local state. */
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
