import { Types } from 'mongoose';
import { HealthConstraint } from '../domain/health-constraint.model';
import { HealthConstraintDoc } from './health-constraint.schema';

/** Lean doc as returned by Mongo reads — carries the generated `_id`. */
export type HealthConstraintLean = HealthConstraintDoc & {
  _id: Types.ObjectId;
};

export const toPersistence = (c: HealthConstraint): HealthConstraintDoc => ({
  user_id: c.userId,
  type: c.type,
  label: c.label,
  affected_muscles: c.affectedMuscles,
  affected_movement_patterns: c.affectedMovementPatterns,
  avoid_exercise_ids: c.avoidExerciseIds,
  severity: c.severity,
  status: c.status,
  source_event_ids: c.sourceEventIds,
  noted_at: c.notedAt,
  resolved_at: c.resolvedAt,
});

export const toDomain = (doc: HealthConstraintLean): HealthConstraint => ({
  id: doc._id?.toString() ?? null,
  userId: doc.user_id,
  type: doc.type,
  label: doc.label,
  affectedMuscles: doc.affected_muscles ?? [],
  affectedMovementPatterns: doc.affected_movement_patterns ?? [],
  avoidExerciseIds: doc.avoid_exercise_ids ?? [],
  severity: doc.severity,
  status: doc.status,
  sourceEventIds: doc.source_event_ids ?? [],
  notedAt: doc.noted_at,
  resolvedAt: doc.resolved_at ?? null,
});
