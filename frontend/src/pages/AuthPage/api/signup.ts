import { request } from '@/shared/api/httpClient';
import type { AuthSession } from '@/shared/auth/authSession';
import { MOCK_API } from '@/shared/config';
import { mockDelay, mockSession } from './mockAuth';

export async function signup(email: string, password: string, name: string): Promise<AuthSession> {
  if (MOCK_API) {
    await mockDelay();
    return mockSession(email, name);
  }
  return request<AuthSession>('/auth/signup', {
    method: 'POST',
    body: { email, password, name },
  });
}
