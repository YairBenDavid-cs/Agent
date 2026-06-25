/**
 * Domain model for a user's training profile — the output of onboarding.
 * Framework-free: no Nest, no Mongoose, no class-validator. Captures the goal
 * plus discipline-specific preferences that drive plan generation.
 *
 * Invariant: exactly one of `run` / `strength` is populated, matching
 * `discipline`. This is enforced at the API boundary (DTO) and assembled here.
 */

export type Discipline = 'running' | 'strength';

export type ProfileStatus = 'in_progress' | 'active' | 'completed';

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type PrimaryGoal =
  | 'build_endurance'
  | 'lose_weight'
  | 'build_muscle'
  | 'get_stronger'
  | 'race_prep'
  | 'general_fitness';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type RunType =
  | 'easy'
  | 'tempo'
  | 'fartlek'
  | 'intervals'
  | 'long'
  | 'recovery';

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

export type SplitPreference =
  | 'full_body'
  | 'upper_lower'
  | 'push_pull_legs'
  | 'bro_split';

/** A recurring weekly availability window, local to the user's timezone. */
export interface AvailabilitySlot {
  day: WeekDay;
  startTime: string; // "HH:mm", 24h
  endTime: string; // "HH:mm", 24h
}

/** The "what do you want in the next 3 months" intent. */
export interface Goal {
  primaryGoal: PrimaryGoal;
  note: string | null; // optional free text
  horizon: string; // YYYY-MM-DD; server-derived (signup + 3 months)
}

/** Running-branch preferences. Populated only when discipline === 'running'. */
export interface RunPrefs {
  weeklyKm: number;
  likedRunTypes: RunType[];
  experienceLevel: ExperienceLevel | null;
  longestRecentKm: number | null;
  targetRace: string | null; // e.g. "10k", "half", "marathon"
  recent5kTime: string | null; // pace baseline, "HH:mm:ss"
}

/** Strength-branch preferences. Populated only when discipline === 'strength'. */
export interface StrengthPrefs {
  targetMuscleGroups: MuscleGroup[];
  exercisesPerSession: number;
  setsPerExercise: number;
  repsPerExercise: number;
  equipment: Equipment[];
  preferredExercises: string[];
  experienceLevel: ExperienceLevel | null;
  splitPreference: SplitPreference | null;
}

export interface TrainingProfile {
  userId: string;
  discipline: Discipline;
  goal: Goal;
  availability: AvailabilitySlot[];
  sessionDurationMin: number;
  run: RunPrefs | null;
  strength: StrengthPrefs | null;
  status: ProfileStatus;
  completedAt: string | null; // ISO timestamp; set when the profile is archived (leaves 'active')
}
