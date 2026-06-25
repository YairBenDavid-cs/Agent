import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PerformanceProfileDocument =
  HydratedDocument<PerformanceProfileEntry>;

/**
 * Append-only per-metric change-log. One row per metric per actual change.
 * Current state = latest entry per metric; trends = all entries for a metric.
 */
@Schema({ collection: 'performance_profile', timestamps: true })
export class PerformanceProfileEntry {
  @Prop({ type: String, required: true }) user_id!: string;
  @Prop({ type: String, required: true }) metric!: string;
  @Prop({ type: Number, required: true }) value!: number;
  @Prop({ type: String, required: true }) effective_date!: string; // YYYY-MM-DD
  @Prop({ type: String, required: true, default: 'garmin' }) source!: string;
}

export const PerformanceProfileSchema = SchemaFactory.createForClass(
  PerformanceProfileEntry,
);

// "current value" + "trend of one metric" both served by this compound index.
PerformanceProfileSchema.index({ user_id: 1, metric: 1, effective_date: -1 });
// Idempotency: at most one entry per metric per day.
PerformanceProfileSchema.index(
  { user_id: 1, metric: 1, effective_date: 1 },
  { unique: true },
);
