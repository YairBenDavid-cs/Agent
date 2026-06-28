import {
  RunPrefs,
  StrengthPrefs,
  TrainingProfile,
} from '../domain/training-profile.model';
import {
  RunPrefsSchemaClass,
  StrengthPrefsSchemaClass,
  TrainingProfile as TrainingProfileDoc,
} from './training-profile.schema';

/**
 * Pure mappers between the domain model (camelCase) and the persistence (DAO,
 * snake_case) shape. No I/O, no side effects. Written field-by-field to prevent
 * accidental leaks of internal fields.
 */

const runToPersistence = (r: RunPrefs): RunPrefsSchemaClass => ({
  weekly_km: r.weeklyKm,
  liked_run_types: r.likedRunTypes,
  experience_level: r.experienceLevel,
  longest_recent_km: r.longestRecentKm,
  target_race: r.targetRace,
  recent_5k_time: r.recent5kTime,
});

const runToDomain = (r: RunPrefsSchemaClass): RunPrefs => ({
  weeklyKm: r.weekly_km,
  likedRunTypes: r.liked_run_types ?? [],
  experienceLevel: r.experience_level ?? null,
  longestRecentKm: r.longest_recent_km ?? null,
  targetRace: r.target_race ?? null,
  recent5kTime: r.recent_5k_time ?? null,
});

const strengthToPersistence = (
  s: StrengthPrefs,
): StrengthPrefsSchemaClass => ({
  target_muscle_groups: s.targetMuscleGroups,
  exercises_per_session: s.exercisesPerSession,
  sets_per_exercise: s.setsPerExercise,
  reps_per_exercise: s.repsPerExercise,
  equipment: s.equipment,
  preferred_exercises: s.preferredExercises,
  training_modalities: s.trainingModalities,
  experience_level: s.experienceLevel,
  split_preference: s.splitPreference,
});

const strengthToDomain = (
  s: StrengthPrefsSchemaClass,
): StrengthPrefs => ({
  targetMuscleGroups: s.target_muscle_groups ?? [],
  exercisesPerSession: s.exercises_per_session,
  setsPerExercise: s.sets_per_exercise,
  repsPerExercise: s.reps_per_exercise,
  equipment: s.equipment ?? [],
  preferredExercises: s.preferred_exercises ?? [],
  trainingModalities: s.training_modalities ?? [],
  experienceLevel: s.experience_level ?? null,
  splitPreference: s.split_preference ?? null,
});

export const toPersistence = (
  profile: TrainingProfile,
): TrainingProfileDoc => ({
  user_id: profile.userId,
  discipline: profile.discipline,
  goal: {
    primary_goal: profile.goal.primaryGoal,
    note: profile.goal.note,
    horizon: profile.goal.horizon,
  },
  availability: profile.availability.map((a) => ({
    day: a.day,
    start_time: a.startTime,
    end_time: a.endTime,
  })),
  session_duration_min: profile.sessionDurationMin,
  run: profile.run ? runToPersistence(profile.run) : null,
  strength: profile.strength ? strengthToPersistence(profile.strength) : null,
  status: profile.status,
  completed_at: profile.completedAt,
});

export const toDomain = (doc: TrainingProfileDoc): TrainingProfile => ({
  userId: doc.user_id,
  discipline: doc.discipline,
  goal: {
    primaryGoal: doc.goal.primary_goal,
    note: doc.goal.note ?? null,
    horizon: doc.goal.horizon,
  },
  availability: (doc.availability ?? []).map((a) => ({
    day: a.day,
    startTime: a.start_time,
    endTime: a.end_time,
  })),
  sessionDurationMin: doc.session_duration_min,
  run: doc.run ? runToDomain(doc.run) : null,
  strength: doc.strength ? strengthToDomain(doc.strength) : null,
  status: doc.status,
  completedAt: doc.completed_at ?? null,
});
