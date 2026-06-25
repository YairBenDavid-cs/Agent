import type { User } from '@/shared/types/user';

export interface AuthSession {
  token: string;
  user: User;
}
