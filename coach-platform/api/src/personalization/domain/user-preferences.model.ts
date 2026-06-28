/**
 * The `user_preferences` projection — the "truth of what's true now", distilled
 * from the append-only preference_events log. Framework-free.
 *
 * One document per (user, discipline). Cross-cutting events (discipline = null,
 * e.g. time-window prefs) are folded into BOTH disciplines' projections at
 * rebuild time, so a single read gives the generator everything it needs for
 * that discipline.
 *
 * Every slice is built from `PrefEntry` blocks, so the projection carries its
 * own provenance (sourceEventIds), evidence meter (supportCount), and the
 * hard/soft distinction the generator obeys. The whole document is disposable:
 * it can always be rebuilt by replaying the log.
 */

import { ExercisePrescription, PrefEntry, TimeWindow } from './pref-entry.model';
import { EventDiscipline } from './preference-event.model';

export interface UserPreferences {
  /** Store-assigned id; null before insert. */
  id: string | null;
  userId: string;
  discipline: EventDiscipline;

  /** Movements to steer away from / toward (canonical catalog ids). */
  avoidedExercises: PrefEntry<string>[];
  preferredExercises: PrefEntry<string>[];

  /** Recurring weekly windows the user will not / wants to train in. */
  blockedTimeWindows: PrefEntry<TimeWindow>[];
  preferredTimeWindows: PrefEntry<TimeWindow>[];

  /** Equipment vocabulary (shared Equipment type) removed from / added to play. */
  removedEquipment: PrefEntry<string>[];
  addedEquipment: PrefEntry<string>[];

  /** TrainingModality leanings (gym / crossfit / hyrox / ...). */
  preferredModalities: PrefEntry<string>[];

  /** Signed scalar nudges the generator applies. Negative = less, positive = more. */
  volumeBias: PrefEntry<number> | null;
  intensityBias: PrefEntry<number> | null;
  diversityBias: PrefEntry<number> | null;

  /* ── Onboarding-settable setpoints (latest explicit value wins) ──── */

  /** Scheduling dials. */
  sessionDurationMin: PrefEntry<number> | null;
  sessionsPerWeek: PrefEntry<number> | null;

  /** Running dials. */
  weeklyKm: PrefEntry<number> | null;
  preferredRunTypes: PrefEntry<string>[];
  avoidedRunTypes: PrefEntry<string>[];

  /** Strength dials. */
  splitPreference: PrefEntry<string> | null;
  exercisesPerSession: PrefEntry<number> | null;
  defaultSets: PrefEntry<number> | null;
  defaultReps: PrefEntry<number> | null;
  targetMuscleGroups: PrefEntry<string>[];
  /** Per-exercise sets/reps/weight overrides (current truth per movement). */
  exercisePrescriptions: PrefEntry<ExercisePrescription>[];

  /** Cross-cutting training context. */
  experienceLevel: PrefEntry<string> | null;
  primaryGoal: PrefEntry<string> | null;

  /** How many events fed this rebuild (audit / staleness signal). */
  sourceEventCount: number;
  taxonomyVersion: number;
  rebuiltAt: string; // ISO timestamp of the distillation run
}
