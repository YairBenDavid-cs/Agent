import { Types } from 'mongoose';
import { ExercisePrescription, PrefEntry } from '../domain/pref-entry.model';
import { UserPreferences } from '../domain/user-preferences.model';
import { PrefEntryClass, UserPreferencesDoc } from './user-preferences.schema';

/** Lean doc as returned by Mongo reads — carries the generated `_id`. */
export type UserPreferencesLean = UserPreferencesDoc & { _id: Types.ObjectId };

/* ── PrefEntry ─────────────────────────────────────────────────── */

const entryToPersistence = <T>(e: PrefEntry<T>): PrefEntryClass => ({
  value: e.value,
  strength: e.strength,
  confidence: e.confidence,
  support_count: e.supportCount,
  source_event_ids: e.sourceEventIds,
  first_seen: e.firstSeen,
  last_reinforced: e.lastReinforced,
  confirmed: e.confirmed,
});

const entryToDomain = <T>(e: PrefEntryClass): PrefEntry<T> => ({
  value: e.value as T,
  strength: e.strength as PrefEntry<T>['strength'],
  confidence: e.confidence as PrefEntry<T>['confidence'],
  supportCount: e.support_count ?? 0,
  sourceEventIds: e.source_event_ids ?? [],
  firstSeen: e.first_seen,
  lastReinforced: e.last_reinforced,
  confirmed: e.confirmed ?? false,
});

const listToPersistence = <T>(xs: PrefEntry<T>[]): PrefEntryClass[] =>
  xs.map(entryToPersistence);
const listToDomain = <T>(xs: PrefEntryClass[] | undefined): PrefEntry<T>[] =>
  (xs ?? []).map((e) => entryToDomain<T>(e));

const singleToPersistence = <T>(
  x: PrefEntry<T> | null,
): PrefEntryClass | null => (x ? entryToPersistence(x) : null);
const singleToDomain = <T>(
  x: PrefEntryClass | null | undefined,
): PrefEntry<T> | null => (x ? entryToDomain<T>(x) : null);

/* ── root ──────────────────────────────────────────────────────── */

export const toPersistence = (p: UserPreferences): UserPreferencesDoc => ({
  user_id: p.userId,
  discipline: p.discipline,
  avoided_exercises: listToPersistence(p.avoidedExercises),
  preferred_exercises: listToPersistence(p.preferredExercises),
  blocked_time_windows: listToPersistence(p.blockedTimeWindows),
  preferred_time_windows: listToPersistence(p.preferredTimeWindows),
  removed_equipment: listToPersistence(p.removedEquipment),
  added_equipment: listToPersistence(p.addedEquipment),
  preferred_modalities: listToPersistence(p.preferredModalities),
  volume_bias: singleToPersistence(p.volumeBias),
  intensity_bias: singleToPersistence(p.intensityBias),
  diversity_bias: singleToPersistence(p.diversityBias),
  session_duration_min: singleToPersistence(p.sessionDurationMin),
  sessions_per_week: singleToPersistence(p.sessionsPerWeek),
  weekly_km: singleToPersistence(p.weeklyKm),
  preferred_run_types: listToPersistence(p.preferredRunTypes),
  avoided_run_types: listToPersistence(p.avoidedRunTypes),
  split_preference: singleToPersistence(p.splitPreference),
  exercises_per_session: singleToPersistence(p.exercisesPerSession),
  default_sets: singleToPersistence(p.defaultSets),
  default_reps: singleToPersistence(p.defaultReps),
  target_muscle_groups: listToPersistence(p.targetMuscleGroups),
  exercise_prescriptions: listToPersistence(p.exercisePrescriptions),
  experience_level: singleToPersistence(p.experienceLevel),
  primary_goal: singleToPersistence(p.primaryGoal),
  source_event_count: p.sourceEventCount,
  taxonomy_version: p.taxonomyVersion,
  rebuilt_at: p.rebuiltAt,
});

export const toDomain = (doc: UserPreferencesLean): UserPreferences => ({
  id: doc._id?.toString() ?? null,
  userId: doc.user_id,
  discipline: doc.discipline,
  avoidedExercises: listToDomain<string>(doc.avoided_exercises),
  preferredExercises: listToDomain<string>(doc.preferred_exercises),
  blockedTimeWindows: listToDomain(doc.blocked_time_windows),
  preferredTimeWindows: listToDomain(doc.preferred_time_windows),
  removedEquipment: listToDomain<string>(doc.removed_equipment),
  addedEquipment: listToDomain<string>(doc.added_equipment),
  preferredModalities: listToDomain<string>(doc.preferred_modalities),
  volumeBias: singleToDomain<number>(doc.volume_bias),
  intensityBias: singleToDomain<number>(doc.intensity_bias),
  diversityBias: singleToDomain<number>(doc.diversity_bias),
  sessionDurationMin: singleToDomain<number>(doc.session_duration_min),
  sessionsPerWeek: singleToDomain<number>(doc.sessions_per_week),
  weeklyKm: singleToDomain<number>(doc.weekly_km),
  preferredRunTypes: listToDomain<string>(doc.preferred_run_types),
  avoidedRunTypes: listToDomain<string>(doc.avoided_run_types),
  splitPreference: singleToDomain<string>(doc.split_preference),
  exercisesPerSession: singleToDomain<number>(doc.exercises_per_session),
  defaultSets: singleToDomain<number>(doc.default_sets),
  defaultReps: singleToDomain<number>(doc.default_reps),
  targetMuscleGroups: listToDomain<string>(doc.target_muscle_groups),
  exercisePrescriptions: listToDomain<ExercisePrescription>(
    doc.exercise_prescriptions,
  ),
  experienceLevel: singleToDomain<string>(doc.experience_level),
  primaryGoal: singleToDomain<string>(doc.primary_goal),
  sourceEventCount: doc.source_event_count ?? 0,
  taxonomyVersion: doc.taxonomy_version,
  rebuiltAt: doc.rebuilt_at,
});
