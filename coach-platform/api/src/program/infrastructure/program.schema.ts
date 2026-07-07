import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  Discipline,
  PlanState,
  ProgramStatus,
  WeekState,
  WeekStatus,
  WeekTheme,
} from '../domain/program.model';

export type ProgramDocument = HydratedDocument<ProgramDoc>;

const WEEK_THEMES = ['assessment', 'base', 'build', 'peak', 'deload', 'taper'];
const PLAN_STATES = ['committed', 'tentative'];
const WEEK_STATUSES = ['upcoming', 'current', 'done'];
const WEEK_STATES = ['open', 'targets_locked', 'locked'];

/* ── embedded sub-blocks ───────────────────────────────────────── */

@Schema({ _id: false })
export class GoalSnapshotClass {
  @Prop({ type: String, required: true }) primary_goal!: string;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: String, required: true }) horizon!: string; // YYYY-MM-DD
}
const GoalSnapshotSchema = SchemaFactory.createForClass(GoalSnapshotClass);

const REVISION_TRIGGERS = ['session_edit', 'direct_target_change'];

@Schema({ _id: false })
export class WeeklyTargetsRevisionClass {
  @Prop({ type: String, required: true }) revised_at!: string;
  @Prop({ type: Number, required: true }) previous_session_count!: number;
  @Prop({ type: Number, required: true }) previous_total_volume!: number;
  @Prop({ type: [String], default: [] }) previous_key_goals!: string[];
  @Prop({ type: String, required: true }) reason!: string;
  @Prop({ type: String, required: true, enum: REVISION_TRIGGERS })
  triggered_by!: 'session_edit' | 'direct_target_change';
}
const WeeklyTargetsRevisionSchema = SchemaFactory.createForClass(
  WeeklyTargetsRevisionClass,
);

@Schema({ _id: false })
export class WeeklyTargetsClass {
  @Prop({ type: Number, required: true }) session_count!: number;
  @Prop({ type: Number, required: true }) total_volume!: number;
  @Prop({ type: [String], default: [] }) key_goals!: string[];
  @Prop({ type: String, default: null }) locked_at!: string | null;
  @Prop({ type: [WeeklyTargetsRevisionSchema], default: [] })
  revision_history!: WeeklyTargetsRevisionClass[];
}
const WeeklyTargetsSchema = SchemaFactory.createForClass(WeeklyTargetsClass);

@Schema({ _id: false })
export class ProgramWeekClass {
  @Prop({ type: Number, required: true, min: 0 }) week_index!: number;
  @Prop({ type: String, required: true }) start_date!: string;
  @Prop({ type: String, required: true }) end_date!: string;
  @Prop({ type: String, required: true, enum: WEEK_THEMES })
  theme!: WeekTheme;
  @Prop({ type: Number, default: null }) planned_load_target!: number | null;
  @Prop({ type: String, required: true, enum: PLAN_STATES })
  plan_state!: PlanState;
  @Prop({ type: String, required: true, enum: WEEK_STATUSES })
  status!: WeekStatus;
  @Prop({ type: String, default: null }) generated_at!: string | null;
  @Prop({ type: String, enum: WEEK_STATES, default: 'open' })
  week_state!: WeekState;
  @Prop({ type: WeeklyTargetsSchema, default: null })
  weekly_targets!: WeeklyTargetsClass | null;
}
const ProgramWeekSchema = SchemaFactory.createForClass(ProgramWeekClass);

/* ── root document ─────────────────────────────────────────────── */

@Schema({ collection: 'programs', timestamps: true })
export class ProgramDoc {
  @Prop({ type: String, required: true }) user_id!: string;

  // Snapshot link to the onboarding profile that seeded this program.
  @Prop({ type: String, default: null }) training_profile_id!: string | null;

  @Prop({ type: String, required: true, enum: ['running', 'strength'] })
  discipline!: Discipline;

  @Prop({ type: GoalSnapshotSchema, required: true })
  goal_snapshot!: GoalSnapshotClass;

  @Prop({ type: String, required: true }) start_date!: string;
  @Prop({ type: String, required: true }) horizon_date!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active',
  })
  status!: ProgramStatus;

  @Prop({ type: Number, required: true, default: 0 })
  current_week_index!: number;

  @Prop({ type: [ProgramWeekSchema], default: [] })
  weeks!: ProgramWeekClass[];
}

export const ProgramSchema = SchemaFactory.createForClass(ProgramDoc);

// At most one active program per user. Re-onboarding/regeneration archives the
// old one (status -> 'completed'/'abandoned') so history is preserved.
ProgramSchema.index(
  { user_id: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
// Program history, newest first.
ProgramSchema.index({ user_id: 1, status: 1, start_date: -1 });
