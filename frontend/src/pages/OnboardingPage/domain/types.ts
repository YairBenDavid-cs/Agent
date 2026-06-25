// Onboarding domain types. These mirror the NestJS training-profile DTOs
// (coach-platform/api/src/training) so the wizard payload matches the API
// contract exactly. The literal unions are kept in sync with the backend's
// training-profile.model.ts.

export type Discipline = 'running' | 'strength';

export type Sex = 'male' | 'female' | 'other';

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type PrimaryGoal =
  | 'build_endurance'
  | 'lose_weight'
  | 'build_muscle'
  | 'get_stronger'
  | 'race_prep'
  | 'general_fitness';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type RunType = 'easy' | 'tempo' | 'fartlek' | 'intervals' | 'long' | 'recovery';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'full_body';

export type Equipment =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'machines'
  | 'resistance_bands'
  | 'cables'
  | 'pullup_bar';

export type SplitPreference = 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split';

/** A recurring weekly availability window. Times are 24h "HH:mm", local. */
export interface AvailabilitySlot {
  day: WeekDay;
  startTime: string;
  endTime: string;
}

/** The user's 3-month intent. `horizon` is server-derived, never sent. */
export interface GoalPayload {
  primaryGoal: PrimaryGoal;
  note?: string;
}

/** Profile fields that land on the `users` record. */
export interface ProfilePayload {
  sex: Sex;
  dateOfBirth: string; // ISO 8601 "YYYY-MM-DD"
  heightCm?: number;
  weightKg?: number;
}

export interface RunPrefsPayload {
  weeklyKm: number;
  likedRunTypes: RunType[];
  experienceLevel?: ExperienceLevel;
  longestRecentKm?: number;
  targetRace?: string;
  recent5kTime?: string;
}

export interface StrengthPrefsPayload {
  targetMuscleGroups: MuscleGroup[];
  exercisesPerSession: number;
  setsPerExercise: number;
  repsPerExercise: number;
  equipment: Equipment[];
  preferredExercises?: string[];
  experienceLevel?: ExperienceLevel;
  splitPreference?: SplitPreference;
}

/**
 * The full onboarding submission — the exact body POSTed to /training-profile.
 * Exactly one of `run` / `strength` is present, matching `discipline`.
 */
export interface OnboardingPayload {
  discipline: Discipline;
  goal: GoalPayload;
  profile: ProfilePayload;
  availability: AvailabilitySlot[];
  sessionDurationMin: number;
  run?: RunPrefsPayload;
  strength?: StrengthPrefsPayload;
}
