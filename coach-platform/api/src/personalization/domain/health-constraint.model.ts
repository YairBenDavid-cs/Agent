/**
 * A health constraint — an injury or limitation that the generator must honour.
 * Framework-free.
 *
 * Distinct from `user_preferences` on purpose:
 *   - user-level and CROSS-DISCIPLINE (a bad knee affects squats AND running).
 *   - NEVER decays. A preference fades if unreinforced; an injury does not.
 *   - materialises from a SINGLE explicit signal (N=1) — safety beats evidence.
 *
 * The injury is captured once in human terms (muscles / movement patterns) and
 * expanded at write time into canonical `avoidExerciseIds`, so the generator
 * filters by id without re-interpreting the injury.
 */

import { MovementPattern } from '../../exercises/domain/exercise-catalog.model';
import { MuscleGroup } from '../../training/domain/training-profile.model';

export type ConstraintType =
  | 'injury'
  | 'mobility_limitation'
  | 'medical'
  | 'other';

/** avoid = hard exclusion. caution = train but reduce load / pick regressions. */
export type ConstraintSeverity = 'avoid' | 'caution';

export type ConstraintStatus = 'active' | 'resolved';

export interface HealthConstraint {
  /** Store-assigned id; null before insert. */
  id: string | null;
  userId: string;
  type: ConstraintType;
  /** Human-readable label, e.g. "left knee — ACL". */
  label: string;
  /** Body regions involved, in the shared MuscleGroup vocabulary. */
  affectedMuscles: MuscleGroup[];
  /** Movement patterns to avoid / limit. */
  affectedMovementPatterns: MovementPattern[];
  /** Canonical catalog ids expanded from the muscles/patterns above. */
  avoidExerciseIds: string[];
  severity: ConstraintSeverity;
  status: ConstraintStatus;
  /** Provenance: the preference_event(s) that created/confirmed this. */
  sourceEventIds: string[];
  notedAt: string; // ISO
  resolvedAt: string | null; // ISO; set when status -> resolved
}
