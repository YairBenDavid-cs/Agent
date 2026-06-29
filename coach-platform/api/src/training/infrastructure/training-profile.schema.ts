import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  Discipline,
  Equipment,
  ExperienceLevel,
  MuscleGroup,
  PrimaryGoal,
  ProfileStatus,
  RunType,
  SplitPreference,
  TrainingModality,
  WeekDay,
} from '../domain/training-profile.model';

export type TrainingProfileDocument = HydratedDocument<TrainingProfile>;

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const PRIMARY_GOALS = [
  'build_endurance',
  'lose_weight',
  'build_muscle',
  'get_stronger',
  'race_prep',
  'general_fitness',
  'improve_speed',
  'run_longer',
  'build_power',
  'body_recomp',
];
const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const RUN_TYPES = ['easy', 'tempo', 'fartlek', 'intervals', 'long', 'recovery'];
const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
  'full_body',
];
const EQUIPMENT = [
  'bodyweight',
  'dumbbells',
  'barbell',
  'kettlebell',
  'machines',
  'resistance_bands',
  'cables',
  'pullup_bar',
];
const SPLIT_PREFERENCES = [
  'full_body',
  'upper_lower',
  'push_pull_legs',
  'bro_split',
];
const TRAINING_MODALITIES = [
  'gym',
  'crossfit',
  'hyrox',
  'hiit',
  'calisthenics',
  'powerlifting',
  'bodybuilding',
];

/* ── shared sub-blocks ─────────────────────────────────────────── */

// One recurring availability window. Times are local to the user's timezone.
@Schema({ _id: false })
export class AvailabilitySlotSchemaClass {
  @Prop({ type: String, required: true, enum: WEEK_DAYS })
  day!: WeekDay;
  @Prop({ type: String, required: true }) start_time!: string; // "06:30"
  @Prop({ type: String, required: true }) end_time!: string; // "08:00"
}
export const AvailabilitySlotSchema = SchemaFactory.createForClass(
  AvailabilitySlotSchemaClass,
);

// The "next 3 months" goal, kept structured + free text. Horizon is derived.
@Schema({ _id: false })
export class GoalSchemaClass {
  @Prop({ type: String, required: true, enum: PRIMARY_GOALS })
  primary_goal!: PrimaryGoal;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: String, required: true }) horizon!: string; // YYYY-MM-DD
}
export const GoalSchema = SchemaFactory.createForClass(GoalSchemaClass);

/* ── RUNNING branch ────────────────────────────────────────────── */

@Schema({ _id: false })
export class RunPrefsSchemaClass {
  @Prop({ type: Number, required: true, min: 0 }) weekly_km!: number;
  @Prop({ type: [String], default: [], enum: RUN_TYPES })
  liked_run_types!: RunType[];
  @Prop({ type: String, default: null, enum: [...EXPERIENCE_LEVELS, null] })
  experience_level!: ExperienceLevel | null;
  @Prop({ type: Number, default: null, min: 0 })
  longest_recent_km!: number | null;
  @Prop({ type: String, default: null }) target_race!: string | null;
  @Prop({ type: String, default: null }) recent_5k_time!: string | null;
}
export const RunPrefsSchema = SchemaFactory.createForClass(RunPrefsSchemaClass);

/* ── STRENGTH branch ───────────────────────────────────────────── */

@Schema({ _id: false })
export class StrengthPrefsSchemaClass {
  @Prop({ type: [String], default: [], enum: MUSCLE_GROUPS })
  target_muscle_groups!: MuscleGroup[];
  @Prop({ type: Number, required: true, min: 1 }) exercises_per_session!: number;
  @Prop({ type: Number, required: true, min: 1 }) sets_per_exercise!: number;
  @Prop({ type: Number, required: true, min: 1 }) reps_per_exercise!: number;
  @Prop({ type: [String], default: [], enum: EQUIPMENT })
  equipment!: Equipment[];
  @Prop({ type: [String], default: [] }) preferred_exercises!: string[];
  @Prop({ type: [String], default: [], enum: TRAINING_MODALITIES })
  training_modalities!: TrainingModality[];
  @Prop({ type: String, default: null, enum: [...EXPERIENCE_LEVELS, null] })
  experience_level!: ExperienceLevel | null;
  @Prop({ type: String, default: null, enum: [...SPLIT_PREFERENCES, null] })
  split_preference!: SplitPreference | null;
}
export const StrengthPrefsSchema = SchemaFactory.createForClass(
  StrengthPrefsSchemaClass,
);

/* ── root document ─────────────────────────────────────────────── */

@Schema({ collection: 'training_profiles', timestamps: true })
export class TrainingProfile {
  @Prop({ type: String, required: true }) user_id!: string;

  // Branch discriminator chosen at the first onboarding step.
  @Prop({ type: String, required: true, enum: ['running', 'strength'] })
  discipline!: Discipline;

  @Prop({ type: GoalSchema, required: true }) goal!: GoalSchemaClass;

  // Shared scheduling prefs (both branches).
  @Prop({ type: [AvailabilitySlotSchema], default: [] })
  availability!: AvailabilitySlotSchemaClass[];
  @Prop({ type: Number, required: true, min: 1 }) session_duration_min!: number;

  // Exactly one is populated, gated by `discipline`.
  @Prop({ type: RunPrefsSchema, default: null }) run!: RunPrefsSchemaClass | null;
  @Prop({ type: StrengthPrefsSchema, default: null })
  strength!: StrengthPrefsSchemaClass | null;

  // Lifecycle. 'active' = current profile; 'completed' = archived after re-onboarding.
  @Prop({
    type: String,
    required: true,
    enum: ['in_progress', 'active', 'completed'],
    default: 'active',
  })
  status!: ProfileStatus;

  @Prop({ type: String, default: null }) completed_at!: string | null;
}

export const TrainingProfileSchema =
  SchemaFactory.createForClass(TrainingProfile);

// At most one active profile per user. Re-onboarding archives the old one
// (status -> 'completed') so history is preserved without a future migration.
TrainingProfileSchema.index(
  { user_id: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
