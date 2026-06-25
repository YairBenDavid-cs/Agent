import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { IngestionStatus } from '../domain/recovery-day.model';

export type RecoveryDailyDocument = HydratedDocument<RecoveryDaily>;

/**
 * Nested metric block. Every field is nullable with default null — a missing
 * Garmin reading is normal and must never block persistence of the rest.
 */
@Schema({ _id: false })
export class RecoveryMetricsSchemaClass {
  @Prop({ type: Number, default: null }) hrv_last_night!: number | null;
  @Prop({ type: String, default: null }) hrv_status!: string | null;
  @Prop({ type: Number, default: null }) resting_hr!: number | null;
  @Prop({ type: Number, default: null }) sleep_score!: number | null;
  @Prop({ type: Number, default: null }) sleep_minutes!: number | null;
  @Prop({ type: Number, default: null }) sleep_deep_pct!: number | null;
  @Prop({ type: Number, default: null }) sleep_rem_pct!: number | null;
  @Prop({ type: Number, default: null }) training_readiness_score!: number | null;
  @Prop({ type: String, default: null }) training_readiness_level!: string | null;
  @Prop({ type: Number, default: null }) recovery_time_min!: number | null;
  @Prop({ type: Number, default: null }) body_battery_morning_peak!: number | null;
  @Prop({ type: Number, default: null }) body_battery_lowest!: number | null;
  @Prop({ type: Number, default: null }) acute_load!: number | null;
  @Prop({ type: Number, default: null }) chronic_load!: number | null;
  @Prop({ type: Number, default: null }) acwr_ratio!: number | null;
  @Prop({ type: String, default: null }) acwr_status!: string | null;
  @Prop({ type: String, default: null }) training_status!: string | null;
  @Prop({ type: Number, default: null }) respiration_overnight_avg!: number | null;
  @Prop({ type: Number, default: null }) spo2_overnight_avg!: number | null;
  @Prop({ type: Number, default: null }) spo2_overnight_lowest!: number | null;
  @Prop({ type: Number, default: null }) stress_yesterday_avg!: number | null;
  @Prop({ type: Number, default: null }) rest_stress_minutes!: number | null;
  @Prop({ type: Number, default: null }) intensity_min_moderate!: number | null;
  @Prop({ type: Number, default: null }) intensity_min_vigorous!: number | null;
  @Prop({ type: Number, default: null }) hrv_baseline_low!: number | null;
  @Prop({ type: Number, default: null }) hrv_baseline_high!: number | null;
  @Prop({ type: Number, default: null }) sleep_need_minutes!: number | null;
}

export const RecoveryMetricsSchema = SchemaFactory.createForClass(
  RecoveryMetricsSchemaClass,
);

@Schema({ collection: 'recovery_daily', timestamps: true })
export class RecoveryDaily {
  @Prop({ type: String, required: true }) user_id!: string;

  @Prop({ type: String, required: true }) date!: string; // YYYY-MM-DD

  @Prop({ type: String, required: true, default: 'garmin' }) source!: string;

  @Prop({ type: String, required: true }) content_hash!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['ok', 'partial', 'failed'],
    default: 'ok',
  })
  ingestion_status!: IngestionStatus;

  @Prop({
    type: [{ field: String, reason: String, _id: false }],
    default: [],
  })
  warnings!: { field: string; reason: string }[];

  @Prop({ type: RecoveryMetricsSchema, required: true })
  recovery!: RecoveryMetricsSchemaClass;
}

export const RecoveryDailySchema = SchemaFactory.createForClass(RecoveryDaily);

// One snapshot per user per day; also serves "last N days" range scans.
RecoveryDailySchema.index({ user_id: 1, date: -1 }, { unique: true });
