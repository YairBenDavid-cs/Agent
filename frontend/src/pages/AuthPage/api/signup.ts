import { request } from '@/shared/api/httpClient';
import { fetchCurrentUser } from '@/shared/auth/meApi';
import type { User } from '@/shared/types/user';
import { MOCK_API } from '@/shared/config';
import { mockDelay, mockUser } from './mockAuth';

// POST /auth/register creates the account, sets the auth cookies and returns
// {userId, role}; the profile is then loaded from GET /users/me.
export async function signup(email: string, password: string, name: string): Promise<User> {
  if (MOCK_API) {
    await mockDelay();
    return mockUser(email, name);
  }
  await request('/auth/register', {
    method: 'POST',
    body: { name, email, password },
  });
  return fetchCurrentUser();
}
