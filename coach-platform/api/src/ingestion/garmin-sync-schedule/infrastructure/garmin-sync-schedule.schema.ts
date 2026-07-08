import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GarminSyncMode } from '../domain/garmin-sync-schedule.model';

export type GarminSyncScheduleDocument = HydratedDocument<GarminSyncScheduleDoc>;

const MODES: GarminSyncMode[] = ['plan', 'auto'];

@Schema({ collection: 'garmin_sync_schedules', timestamps: true })
export class GarminSyncScheduleDoc {
  @Prop({ type: String, required: true, unique: true }) user_id!: string;
  @Prop({ type: [String], required: true }) sync_times_local!: string[];
  @Prop({ type: String, required: true, enum: MODES, default: 'plan' })
  mode!: GarminSyncMode;
  @Prop({ type: Boolean, required: true, default: true }) enabled!: boolean;
  @Prop({ type: Object, default: {} }) last_fired_at!: Record<string, string>;
}

export const GarminSyncScheduleSchema = SchemaFactory.createForClass(
  GarminSyncScheduleDoc,
);

// One schedule per user; the sweep reads it by user_id every minute.
GarminSyncScheduleSchema.index({ user_id: 1 }, { unique: true });
