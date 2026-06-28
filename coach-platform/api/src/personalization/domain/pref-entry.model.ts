/**
 * The reusable building block of the personalization projection.
 * Framework-free. Every learned preference is stored as a PrefEntry so the
 * projection carries its own provenance — which powers self-explanation (the
 * assistant cites `sourceEventIds`), promotion/decay (`supportCount`,
 * `lastReinforced`), and the hard/soft distinction the generator obeys.
 *
 * Used by Phase 2 (user_preferences projection). Defined here as a foundation
 * type so multiple stores can reference it without a circular dependency.
 */

/** hard = never violate (explicit + standing, or confirmed). soft = lean toward. */
export type PrefStrength = 'hard' | 'soft';

/** explicit = the user said it. inferred = we deduced it from behaviour. */
export type PrefConfidence = 'explicit' | 'inferred';

export interface PrefEntry<T> {
  value: T;
  strength: PrefStrength;
  confidence: PrefConfidence;
  /** How much evidence backs this preference (the anomaly-vs-evidence meter). */
  supportCount: number;
  /** Provenance: ids of the preference_events that produced/reinforced this. */
  sourceEventIds: string[];
  firstSeen: string; // ISO timestamp
  lastReinforced: string; // ISO timestamp — drives decay
  /** True once an inferred signal has been confirmed by the user. */
  confirmed: boolean;
}

/** A recurring weekly time window, local to the user's timezone. */
export interface TimeWindow {
  day: string; // 'mon'..'sun' or '*' for every day
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** A per-exercise prescription override (current truth for one movement). */
export interface ExercisePrescription {
  exerciseId: string; // canonical catalog id
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
}
