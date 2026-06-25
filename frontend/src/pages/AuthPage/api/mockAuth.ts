import type { AuthSession } from '@/shared/auth/authSession';

// Builds a believable local session so the login/signup flow works without a
// backend. Swapped out for real API calls once VITE_MOCK_API=false.
function deriveName(email: string): string {
  const local = email.split('@')[0] ?? 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function mockSession(email: string, name?: string): AuthSession {
  const displayName = name?.trim() !== undefined && name?.trim() !== '' ? name.trim() : deriveName(email);
  const initial = displayName.charAt(0).toUpperCase() || 'U';
  return {
    token: `mock.${crypto.randomUUID()}`,
    user: {
      id: crypto.randomUUID(),
      name: displayName,
      email,
      avatarUrl: `https://placehold.co/96x96?text=${encodeURIComponent(initial)}`,
    },
  };
}

export function mockDelay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
