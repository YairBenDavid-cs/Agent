import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { IngestionStatus } from '../../recovery/domain/recovery-day.model';

export type PerformanceDailyDocument = HydratedDocument<PerformanceDaily>;

@Schema({ _id: false })
export class PerformanceRunningDailyClass {
  @Prop({ type: Number, default: null }) running_tolerance!: number | null;
  @Prop({ type: Number, default: null }) weekly_distance_km!: number | null;
  @Prop({ type: Number, default: null }) weekly_intensity_moderate!:
    | number
    | null;
  @Prop({ type: Number, default: null }) weekly_intensity_vigorous!:
    | number
    | null;
}
export const PerformanceRunningDailySchema = SchemaFactory.createForClass(
  PerformanceRunningDailyClass,
);

@Schema({ _id: false })
export class PerformanceStrengthDailyClass {
  @Prop({ type: Number, default: null }) weekly_volume_load!: number | null;
}
export const PerformanceStrengthDailySchema = SchemaFactory.createForClass(
  PerformanceStrengthDailyClass,
);

@Schema({ collection: 'performance_daily', timestamps: true })
export class PerformanceDaily {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true }) date!: string;
  @Prop({ type: String, required: true, default: 'garmin' }) source!: string;
  @Prop({ type: String, required: true }) content_hash!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['ok', 'partial', 'failed'],
    default: 'ok',
  })
  ingestion_status!: IngestionStatus;

  @Prop({ type: [{ field: String, reason: String, _id: false }], default: [] })
  warnings!: { field: string; reason: string }[];

  @Prop({ type: PerformanceRunningDailySchema, required: true })
  running!: PerformanceRunningDailyClass;

  @Prop({ type: PerformanceStrengthDailySchema, required: true })
  strength!: PerformanceStrengthDailyClass;
}

export const PerformanceDailySchema =
  SchemaFactory.createForClass(PerformanceDaily);

PerformanceDailySchema.index({ user_id: 1, date: -1 }, { unique: true });
