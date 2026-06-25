import { request } from '@/shared/api/httpClient';
import type { User } from '@/shared/types/user';

// GET /users/me returns the full profile; the UI only needs these fields.
interface MeResponse {
  id: string;
  name: string;
  email: string;
}

/** Resolve the current user from the session cookie. Rejects (401) if logged out. */
export async function fetchCurrentUser(): Promise<User> {
  const me = await request<MeResponse>('/users/me');
  return { id: me.id, name: me.name, email: me.email };
}

/** Revoke the server-side session and clear the auth cookies. */
export async function logoutRequest(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST' });
}
