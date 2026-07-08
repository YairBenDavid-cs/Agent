import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  AutoModeRunStatus,
  AutoModeScenario,
  AutoModeTrigger,
} from '../domain/auto-mode-run.model';

export type AutoModeRunDocument = HydratedDocument<AutoModeRunDoc>;

const STATUSES: AutoModeRunStatus[] = [
  'running',
  'committed',
  'aborted',
  'failed',
];
const SCENARIOS: AutoModeScenario[] = [
  'new_week',
  'weekly_targets_edit',
  'session_edit',
  'session_time_edit',
];
const TRIGGERS: AutoModeTrigger[] = [
  'chat',
  'scheduled_rollover',
  'manual_trigger',
];

@Schema({ _id: false })
export class AutoModeTraceEntryClass {
  @Prop({ type: String, required: true }) node!: string;
  @Prop({ type: String, required: true }) at!: string;
  @Prop({ type: String, required: true }) summary!: string;
}
const AutoModeTraceEntrySchema = SchemaFactory.createForClass(
  AutoModeTraceEntryClass,
);

@Schema({ collection: 'auto_mode_runs', timestamps: true })
export class AutoModeRunDoc {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true }) program_id!: string;
  @Prop({ type: Number, required: true }) week_index!: number;
  @Prop({ type: String, required: true, enum: SCENARIOS })
  scenario!: AutoModeScenario;
  @Prop({ type: String, required: true, enum: TRIGGERS })
  trigger!: AutoModeTrigger;
  @Prop({ type: String, required: true }) conversation_id!: string;
  @Prop({ type: String, required: true, enum: STATUSES, default: 'running' })
  status!: AutoModeRunStatus;
  @Prop({ type: [AutoModeTraceEntrySchema], default: [] })
  trace!: AutoModeTraceEntryClass[];
  @Prop({ type: Object, default: null }) before_snapshot!: unknown;
  @Prop({ type: Object, default: null }) diff!: unknown;
  @Prop({ type: String, default: null }) failure_reason!: string | null;
  @Prop({ type: Boolean, default: false }) writes_performed!: boolean;
  @Prop({ type: Boolean, default: false }) reverted!: boolean;
  @Prop({ type: String, default: null }) started_at!: string | null;
  @Prop({ type: String, default: null }) completed_at!: string | null;
}

export const AutoModeRunSchema = SchemaFactory.createForClass(AutoModeRunDoc);

// User-facing history: this user's runs, newest first.
AutoModeRunSchema.index({ user_id: 1, createdAt: -1 });
// One active run per program week — enforced at the app layer via
// ProgramWeek.runLockId; this index just makes that lookup cheap.
AutoModeRunSchema.index({ program_id: 1, week_index: 1, status: 1 });
// Global sweep across tenants (cron): stale `running` runs, oldest first.
AutoModeRunSchema.index({ status: 1, started_at: 1 });
