import { request } from '@/shared/api/httpClient';
import { fetchCurrentUser } from '@/shared/auth/meApi';
import type { User } from '@/shared/types/user';
import { MOCK_API } from '@/shared/config';
import { mockDelay, mockUser } from './mockAuth';

// The backend sets the auth cookies on a 200 and returns only {userId, role};
// we then hydrate the full profile from GET /users/me.
export async function login(email: string, password: string): Promise<User> {
  if (MOCK_API) {
    await mockDelay();
    return mockUser(email);
  }
  await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return fetchCurrentUser();
}
