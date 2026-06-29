import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RunType } from '../../training/domain/training-profile.model';
import {
  CalendarSyncState,
  PlannedSessionType,
  PlannedStatus,
  PlanState,
  ReasonCode,
  SegmentKind,
  StepType,
} from '../domain/planned-session.model';

export type PlannedSessionDocument = HydratedDocument<PlannedSessionDoc>;

const RUN_TYPES = ['easy', 'tempo', 'fartlek', 'intervals', 'long', 'recovery'];
const SEGMENT_KINDS = ['warmup', 'work', 'recovery', 'cooldown'];
const STEP_TYPES = ['run', 'rest'];
const PLAN_STATES = ['committed', 'tentative'];
const PLANNED_STATUSES = [
  'planned',
  'completed',
  'partially_completed',
  'skipped',
  'deviated',
];
const REASON_CODES = [
  'disliked_time',
  'disliked_exercise',
  'volume_too_high',
  'volume_too_low',
  'too_hard',
  'too_easy',
  'no_motivation',
  'injury_or_illness',
  'time_constraint',
  'weather',
  'travel',
  'other',
];
const SYNC_STATES = ['pending', 'synced', 'failed'];

/* ── RUNNING prescription ──────────────────────────────────────── */

@Schema({ _id: false })
export class RunStepClass {
  @Prop({ type: String, required: true, enum: STEP_TYPES })
  type!: StepType;
  @Prop({ type: Number, default: null }) distance_m!: number | null;
  @Prop({ type: Number, default: null }) duration_sec!: number | null;
  @Prop({ type: String, default: null }) target_pace!: string | null;
  @Prop({ type: Number, default: null }) target_hr_zone!: number | null;
  @Prop({ type: String, default: null }) note!: string | null;
}
const RunStepSchema = SchemaFactory.createForClass(RunStepClass);

@Schema({ _id: false })
export class RunBlockClass {
  @Prop({ type: String, required: true, enum: SEGMENT_KINDS })
  kind!: SegmentKind;
  @Prop({ type: String, default: null }) label!: string | null;
  @Prop({ type: Number, required: true, default: 1 }) repeat!: number;
  @Prop({ type: [RunStepSchema], default: [] }) steps!: RunStepClass[];
}
const RunBlockSchema = SchemaFactory.createForClass(RunBlockClass);

@Schema({ _id: false })
export class RunningPlanClass {
  @Prop({ type: String, required: true, enum: RUN_TYPES }) run_type!: RunType;
  @Prop({ type: Number, default: null }) total_distance_km!: number | null;
  @Prop({ type: Number, default: null }) total_duration_min!: number | null;
  @Prop({ type: String, default: null }) target_pace!: string | null;
  @Prop({ type: Number, default: null }) target_hr_zone!: number | null;
  @Prop({ type: Number, default: null }) target_rpe!: number | null;
  @Prop({ type: [RunBlockSchema], default: [] }) blocks!: RunBlockClass[];
}
const RunningPlanSchema = SchemaFactory.createForClass(RunningPlanClass);

/* ── STRENGTH prescription ─────────────────────────────────────── */

@Schema({ _id: false })
export class PlannedExerciseClass {
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String, required: true }) category!: string;
  @Prop({ type: Number, required: true }) order!: number;
  @Prop({ type: Number, required: true }) sets!: number;
  @Prop({ type: Number, required: true }) target_reps_min!: number;
  @Prop({ type: Number, required: true }) target_reps_max!: number;
  @Prop({ type: Number, default: null }) target_weight_kg!: number | null;
  @Prop({ type: Number, default: null }) target_pct_1rm!: number | null;
  @Prop({ type: Number, default: null }) target_rir!: number | null;
  @Prop({ type: Number, default: null }) rest_sec!: number | null;
  @Prop({ type: String, default: null }) tempo!: string | null;
  @Prop({ type: String, default: null }) superset_group!: string | null;
}
const PlannedExerciseSchema = SchemaFactory.createForClass(PlannedExerciseClass);

@Schema({ _id: false })
export class StrengthPlanClass {
  @Prop({ type: String, default: null }) split_focus!: string | null;
  @Prop({ type: [PlannedExerciseSchema], default: [] })
  exercises!: PlannedExerciseClass[];
  @Prop({ type: Number, default: null }) target_volume_load!: number | null;
}
const StrengthPlanSchema = SchemaFactory.createForClass(StrengthPlanClass);

/* ── outcome ───────────────────────────────────────────────────── */

@Schema({ _id: false })
export class PlannedOutcomeClass {
  @Prop({
    type: String,
    required: true,
    enum: PLANNED_STATUSES,
    default: 'planned',
  })
  status!: PlannedStatus;
  @Prop({ type: String, default: null, enum: [...REASON_CODES, null] })
  reason_code!: ReasonCode | null;
  @Prop({ type: Number, default: null }) perceived_effort!: number | null;
  @Prop({ type: Number, default: null }) enjoyment!: number | null;
  @Prop({ type: Number, default: null }) matched_activity_id!: number | null;
  @Prop({ type: String, default: null }) feedback_ref!: string | null;
  @Prop({ type: String, default: null }) recorded_at!: string | null;
}
const PlannedOutcomeSchema = SchemaFactory.createForClass(PlannedOutcomeClass);

/* ── calendar sync ─────────────────────────────────────────────── */

@Schema({ _id: false })
export class CalendarSyncClass {
  @Prop({ type: String, required: true, default: 'google' }) provider!: string;
  @Prop({ type: String, default: null }) event_id!: string | null;
  @Prop({ type: String, default: null }) synced_at!: string | null;
  @Prop({ type: String, required: true, enum: SYNC_STATES, default: 'pending' })
  sync_state!: CalendarSyncState;
}
const CalendarSyncSchema = SchemaFactory.createForClass(CalendarSyncClass);

/* ── commit diff ───────────────────────────────────────────────── */

@Schema({ _id: false })
export class SessionDiffChangeClass {
  @Prop({ type: String, required: true }) field!: string;
  @Prop({ type: Object, default: null }) before!: string | number | null;
  @Prop({ type: Object, default: null }) after!: string | number | null;
}
const SessionDiffChangeSchema = SchemaFactory.createForClass(
  SessionDiffChangeClass,
);

@Schema({ _id: false })
export class SessionDiffClass {
  @Prop({ type: String, required: true }) committed_at!: string;
  @Prop({ type: [SessionDiffChangeSchema], default: [] })
  changes!: SessionDiffChangeClass[];
}
const SessionDiffSchema = SchemaFactory.createForClass(SessionDiffClass);

/* ── root document ─────────────────────────────────────────────── */

@Schema({ collection: 'planned_sessions', timestamps: true })
export class PlannedSessionDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true }) program_id!: string;
  @Prop({ type: Number, required: true, min: 0 }) week_index!: number;
  @Prop({ type: String, required: true }) slot_key!: string;

  @Prop({ type: String, required: true, enum: ['running', 'strength'] })
  type!: PlannedSessionType;

  // Scheduling.
  @Prop({ type: String, required: true }) scheduled_date!: string;
  @Prop({ type: String, required: true }) start_time!: string;
  @Prop({ type: String, required: true }) end_time!: string;
  @Prop({ type: String, required: true }) timezone!: string;
  @Prop({ type: String, required: true }) scheduled_start_utc!: string;

  @Prop({ type: String, required: true, enum: PLAN_STATES })
  plan_state!: PlanState;

  // Shared prescription metadata.
  @Prop({ type: String, required: true }) title!: string;
  @Prop({ type: Number, required: true }) est_duration_min!: number;
  @Prop({ type: String, required: true }) intensity_label!: string;
  @Prop({ type: String, default: null }) coach_notes!: string | null;

  @Prop({ type: RunningPlanSchema, default: null })
  running!: RunningPlanClass | null;
  @Prop({ type: StrengthPlanSchema, default: null })
  strength!: StrengthPlanClass | null;

  @Prop({ type: PlannedOutcomeSchema, default: () => ({ status: 'planned' }) })
  outcome!: PlannedOutcomeClass;

  @Prop({ type: CalendarSyncSchema, default: null })
  calendar_sync!: CalendarSyncClass | null;

  @Prop({ type: SessionDiffSchema, default: null })
  last_diff!: SessionDiffClass | null;
}

export const PlannedSessionSchema =
  SchemaFactory.createForClass(PlannedSessionDoc);

// Primary: calendar/card range fetch and weekly look-back.
PlannedSessionSchema.index({ user_id: 1, scheduled_date: 1 });
// Fetch a whole week / program composition.
PlannedSessionSchema.index({ user_id: 1, program_id: 1, week_index: 1 });
// The "passed & still planned" nudge scan and adherence rollups.
PlannedSessionSchema.index({
  user_id: 1,
  'outcome.status': 1,
  scheduled_date: 1,
});
// Matcher resolving a Garmin/self-report session to its plan.
PlannedSessionSchema.index(
  { user_id: 1, 'outcome.matched_activity_id': 1 },
  { sparse: true },
);
// Generator idempotency — one train per (program, week, slot).
PlannedSessionSchema.index(
  { program_id: 1, week_index: 1, slot_key: 1 },
  { unique: true },
);
