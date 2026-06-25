import { request } from '@/shared/api/httpClient';
import type { AuthSession } from '@/shared/auth/authSession';
import { MOCK_API } from '@/shared/config';
import { mockDelay, mockSession } from './mockAuth';

export async function login(email: string, password: string): Promise<AuthSession> {
  if (MOCK_API) {
    await mockDelay();
    return mockSession(email);
  }
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}
