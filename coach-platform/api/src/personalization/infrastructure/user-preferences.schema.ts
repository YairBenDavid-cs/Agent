import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { EventDiscipline } from '../domain/preference-event.model';

export type UserPreferencesDocument = HydratedDocument<UserPreferencesDoc>;

const DISCIPLINES = ['running', 'strength'];
const STRENGTHS = ['hard', 'soft'];
const CONFIDENCES = ['explicit', 'inferred'];

/* ── PrefEntry building block (value is polymorphic) ───────────── */

@Schema({ _id: false })
export class PrefEntryClass {
  // string | number | TimeWindow object — stored opaquely.
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) value!: unknown;
  @Prop({ type: String, required: true, enum: STRENGTHS }) strength!: string;
  @Prop({ type: String, required: true, enum: CONFIDENCES })
  confidence!: string;
  @Prop({ type: Number, required: true, default: 0 }) support_count!: number;
  @Prop({ type: [String], default: [] }) source_event_ids!: string[];
  @Prop({ type: String, required: true }) first_seen!: string;
  @Prop({ type: String, required: true }) last_reinforced!: string;
  @Prop({ type: Boolean, required: true, default: false }) confirmed!: boolean;
}
const PrefEntrySchema = SchemaFactory.createForClass(PrefEntryClass);

/* ── root projection document ──────────────────────────────────── */

@Schema({ collection: 'user_preferences', timestamps: true })
export class UserPreferencesDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true, enum: DISCIPLINES })
  discipline!: EventDiscipline;

  @Prop({ type: [PrefEntrySchema], default: [] })
  avoided_exercises!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  preferred_exercises!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  blocked_time_windows!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  preferred_time_windows!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  removed_equipment!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  added_equipment!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  preferred_modalities!: PrefEntryClass[];

  @Prop({ type: PrefEntrySchema, default: null })
  volume_bias!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  intensity_bias!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  diversity_bias!: PrefEntryClass | null;

  /* ── onboarding-settable setpoints + list dials ─────────────── */

  @Prop({ type: PrefEntrySchema, default: null })
  session_duration_min!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  sessions_per_week!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  weekly_km!: PrefEntryClass | null;
  @Prop({ type: [PrefEntrySchema], default: [] })
  preferred_run_types!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  avoided_run_types!: PrefEntryClass[];
  @Prop({ type: PrefEntrySchema, default: null })
  split_preference!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  exercises_per_session!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  default_sets!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  default_reps!: PrefEntryClass | null;
  @Prop({ type: [PrefEntrySchema], default: [] })
  target_muscle_groups!: PrefEntryClass[];
  @Prop({ type: [PrefEntrySchema], default: [] })
  exercise_prescriptions!: PrefEntryClass[];
  @Prop({ type: PrefEntrySchema, default: null })
  experience_level!: PrefEntryClass | null;
  @Prop({ type: PrefEntrySchema, default: null })
  primary_goal!: PrefEntryClass | null;

  @Prop({ type: Number, required: true, default: 0 }) source_event_count!: number;
  @Prop({ type: Number, required: true }) taxonomy_version!: number;
  @Prop({ type: String, required: true }) rebuilt_at!: string;
}

export const UserPreferencesSchema =
  SchemaFactory.createForClass(UserPreferencesDoc);

// One projection per (user, discipline); the rebuild upserts on this key.
UserPreferencesSchema.index({ user_id: 1, discipline: 1 }, { unique: true });
