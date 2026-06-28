import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MovementPattern } from '../../exercises/domain/exercise-catalog.model';
import { MuscleGroup } from '../../training/domain/training-profile.model';
import {
  ConstraintSeverity,
  ConstraintStatus,
  ConstraintType,
} from '../domain/health-constraint.model';

export type HealthConstraintDocument = HydratedDocument<HealthConstraintDoc>;

const TYPES = ['injury', 'mobility_limitation', 'medical', 'other'];
const SEVERITIES = ['avoid', 'caution'];
const STATUSES = ['active', 'resolved'];

@Schema({ collection: 'health_constraints', timestamps: true })
export class HealthConstraintDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true, enum: TYPES }) type!: ConstraintType;
  @Prop({ type: String, required: true }) label!: string;
  @Prop({ type: [String], default: [] }) affected_muscles!: MuscleGroup[];
  @Prop({ type: [String], default: [] })
  affected_movement_patterns!: MovementPattern[];
  @Prop({ type: [String], default: [] }) avoid_exercise_ids!: string[];
  @Prop({ type: String, required: true, enum: SEVERITIES })
  severity!: ConstraintSeverity;
  @Prop({ type: String, required: true, enum: STATUSES, default: 'active' })
  status!: ConstraintStatus;
  @Prop({ type: [String], default: [] }) source_event_ids!: string[];
  @Prop({ type: String, required: true }) noted_at!: string;
  @Prop({ type: String, default: null }) resolved_at!: string | null;
}

export const HealthConstraintSchema =
  SchemaFactory.createForClass(HealthConstraintDoc);

// Generator's hot path: fetch a user's currently-active constraints.
HealthConstraintSchema.index({ user_id: 1, status: 1 });
