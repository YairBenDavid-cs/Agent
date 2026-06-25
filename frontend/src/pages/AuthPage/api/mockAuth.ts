import type { User } from '@/shared/types/user';

// Builds a believable local user so the login/signup flow works without a
// backend. Swapped out for real API calls once VITE_MOCK_API=false.
function deriveName(email: string): string {
  const local = email.split('@')[0] ?? 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function mockUser(email: string, name?: string): User {
  const displayName =
    name?.trim() !== undefined && name?.trim() !== '' ? name.trim() : deriveName(email);
  return {
    id: crypto.randomUUID(),
    name: displayName,
    email,
  };
}

export function mockDelay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
