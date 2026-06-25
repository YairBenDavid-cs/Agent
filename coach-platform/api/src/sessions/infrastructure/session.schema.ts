import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { SessionType } from '../domain/workout-session.model';

export type SessionDocument = HydratedDocument<WorkoutSessionDoc>;

@Schema({ _id: false })
export class RunningSplitClass {
  @Prop({ type: Number, default: null }) distance_m!: number | null;
  @Prop({ type: String, default: null }) pace!: string | null;
  @Prop({ type: Number, default: null }) avg_hr!: number | null;
}
const RunningSplitSchema = SchemaFactory.createForClass(RunningSplitClass);

@Schema({ _id: false })
export class RunningDetailClass {
  @Prop({ type: String, default: null }) name!: string | null;
  @Prop({ type: Number, default: null }) distance_km!: number | null;
  @Prop({ type: Number, default: null }) duration_min!: number | null;
  @Prop({ type: String, default: null }) avg_pace!: string | null;
  @Prop({ type: Number, default: null }) avg_hr!: number | null;
  @Prop({ type: Number, default: null }) max_hr!: number | null;
  @Prop({ type: Number, default: null }) aerobic_te!: number | null;
  @Prop({ type: Number, default: null }) anaerobic_te!: number | null;
  @Prop({ type: String, default: null }) te_label!: string | null;
  @Prop({ type: Number, default: null }) training_load!: number | null;
  @Prop({ type: Number, default: null }) calories!: number | null;
  @Prop({ type: Number, default: null }) elevation_gain_m!: number | null;
  @Prop({ type: Number, default: null }) avg_cadence!: number | null;
  @Prop({ type: Number, default: null }) avg_stride_length_cm!: number | null;
  @Prop({ type: Number, default: null }) avg_ground_contact_ms!: number | null;
  @Prop({ type: [RunningSplitSchema], default: [] })
  splits!: RunningSplitClass[];
}
const RunningDetailSchema = SchemaFactory.createForClass(RunningDetailClass);

@Schema({ _id: false })
export class ExerciseAggregateClass {
  @Prop({ type: String, required: true }) category!: string;
  @Prop({ type: Number, default: 0 }) sets!: number;
  @Prop({ type: Number, default: 0 }) reps!: number;
  @Prop({ type: Number, default: 0 }) top_weight_kg!: number;
  @Prop({ type: Number, default: 0 }) volume_load!: number;
  @Prop({ type: Number, default: 0 }) est_1rm_kg!: number;
}
const ExerciseAggregateSchema =
  SchemaFactory.createForClass(ExerciseAggregateClass);

@Schema({ _id: false })
export class StrengthDetailClass {
  @Prop({ type: String, default: null }) name!: string | null;
  @Prop({ type: Number, default: null }) duration_min!: number | null;
  @Prop({ type: Number, default: null }) avg_hr!: number | null;
  @Prop({ type: Number, default: null }) max_hr!: number | null;
  @Prop({ type: Number, default: null }) calories!: number | null;
  @Prop({ type: Number, default: null }) aerobic_te!: number | null;
  @Prop({ type: Number, default: null }) anaerobic_te!: number | null;
  @Prop({ type: String, default: null }) te_label!: string | null;
  @Prop({ type: Number, default: null }) training_load!: number | null;
  @Prop({ type: Number, default: null }) total_sets!: number | null;
  @Prop({ type: Number, default: null }) total_reps!: number | null;
  @Prop({ type: Number, default: null }) session_volume_load!: number | null;
  @Prop({ type: [ExerciseAggregateSchema], default: [] })
  exercises!: ExerciseAggregateClass[];
}
const StrengthDetailSchema = SchemaFactory.createForClass(StrengthDetailClass);

@Schema({ collection: 'sessions', timestamps: true })
export class WorkoutSessionDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: Number, required: true }) activity_id!: number;
  @Prop({ type: String, required: true }) date!: string;

  @Prop({ type: String, required: true, enum: ['running', 'strength'] })
  type!: SessionType;

  @Prop({ type: String, default: null }) subtype!: string | null;
  @Prop({ type: String, required: true, default: 'garmin' }) source!: string;
  @Prop({ type: String, required: true }) content_hash!: string;

  @Prop({ type: RunningDetailSchema, default: null })
  running!: RunningDetailClass | null;

  @Prop({ type: StrengthDetailSchema, default: null })
  strength!: StrengthDetailClass | null;
}

export const SessionSchema = SchemaFactory.createForClass(WorkoutSessionDoc);

SessionSchema.index({ user_id: 1, activity_id: 1 }, { unique: true });
SessionSchema.index({ user_id: 1, date: -1 });
SessionSchema.index({ user_id: 1, type: 1, date: -1 });
