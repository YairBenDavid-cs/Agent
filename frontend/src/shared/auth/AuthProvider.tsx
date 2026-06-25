import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { AuthSession } from './authSession';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';
import { clearSession, getSession, setSession } from './tokenStorage';

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, setSessionState] = useState<AuthSession | null>(() => getSession());

  const login = useCallback((next: AuthSession): void => {
    setSession(next);
    setSessionState(next);
  }, []);

  const logout = useCallback((): void => {
    clearSession();
    setSessionState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, login, logout }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
