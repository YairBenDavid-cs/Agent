export type Sex = 'male' | 'female' | 'other';
export type Units = 'metric' | 'imperial';
export type UserStatus = 'active' | 'disabled';
export type UserRole = 'user' | 'admin';

/** Profile / general data. No secrets — credentials live in Integrations. */
export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  dateOfBirth: string; // YYYY-MM-DD; age is derived, never stored
  sex: Sex;
  country: string;
  timezone: string; // IANA, e.g. "Asia/Jerusalem" — drives scheduling
  locale: string;
  units: Units;
  heightCm: number | null;
  weightKg: number | null;
  status: UserStatus;
  role: UserRole;
}
