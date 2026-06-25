import { createContext } from 'react';
import type { AuthSession } from './authSession';

export interface AuthContextValue {
  session: AuthSession | null;
  login: (session: AuthSession) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
