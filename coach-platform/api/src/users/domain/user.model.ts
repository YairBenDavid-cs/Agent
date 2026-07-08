export type Sex = 'male' | 'female' | 'other';
export type Units = 'metric' | 'imperial';
export type UserStatus = 'active' | 'disabled';
export type UserRole = 'user' | 'admin';

/**
 * Profile / general data. No secrets — credentials live in Integrations.
 * Only email + name are captured at signup; the rest are filled in during a
 * later onboarding step, so they're nullable until then.
 */
export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  dateOfBirth: string | null; // YYYY-MM-DD; age is derived, never stored
  sex: Sex | null;
  country: string | null;
  timezone: string | null; // IANA, e.g. "Asia/Jerusalem" — drives scheduling
  locale: string;
  units: Units;
  heightCm: number | null;
  weightKg: number | null;
  status: UserStatus;
  role: UserRole;
  /** Opt-in to autonomous week/session builds (AutoModeGraph). Off by default. */
  autoModeOptIn: boolean;
}
