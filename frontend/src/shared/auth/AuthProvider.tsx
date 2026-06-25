import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { User } from '@/shared/types/user';
import { AuthContext } from './AuthContext';
import type { AuthContextValue } from './AuthContext';
import { onLogout } from './authEvents';
import { fetchCurrentUser, logoutRequest } from './meApi';

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on load. With httpOnly cookies the token isn't visible
  // to JS, so we ask the server who we are; a rejection means logged out.
  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // The http client emits this when a token refresh ultimately fails mid-session.
  useEffect(() => onLogout(() => setUser(null)), []);

  const login = useCallback((next: User): void => {
    setUser(next);
  }, []);

  const logout = useCallback((): void => {
    setUser(null); // optimistic: clear UI immediately
    void logoutRequest().catch(() => undefined); // best-effort revoke
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
