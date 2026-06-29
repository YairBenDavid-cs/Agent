import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Secrets at rest. This collection holds ONLY ciphertext for credential fields
 * (`*_enc`). It is intentionally separate from `users` so it can carry stricter
 * access controls and so a profile read never pulls secrets into memory.
 */

@Schema({ _id: false })
export class GarminCreds {
  @Prop({ type: String, required: true }) email!: string;
  @Prop({ type: String, required: true }) password_enc!: string;
  @Prop({ type: String, default: null }) session_enc!: string | null;
  @Prop({ type: String, default: null }) session_expires_at!: string | null;
  @Prop({ type: String, required: true }) updated_at!: string;
  // Latest ingestion run state. Defaults to 'syncing' because connecting Garmin
  // immediately kicks off the first backfill.
  @Prop({
    type: String,
    enum: ['syncing', 'synced', 'auth_failed', 'sync_failed'],
    default: 'syncing',
  })
  sync_status!: string;
  @Prop({ type: String, default: null }) last_sync_error!: string | null;
  @Prop({ type: String, default: null }) last_synced_at!: string | null;
}
export const GarminCredsSchema = SchemaFactory.createForClass(GarminCreds);

@Schema({ _id: false })
export class GoogleCalendarCreds {
  @Prop({ type: String, required: true }) refresh_token_enc!: string;
  @Prop({ type: String, required: true }) updated_at!: string;
}
export const GoogleCalendarCredsSchema =
  SchemaFactory.createForClass(GoogleCalendarCreds);

@Schema({ _id: false })
export class TelegramCreds {
  @Prop({ type: String, required: true }) chat_id!: string;
  @Prop({ type: String, required: true }) bot_token_enc!: string;
  @Prop({ type: String, required: true }) updated_at!: string;
}
export const TelegramCredsSchema = SchemaFactory.createForClass(TelegramCreds);

export type UserIntegrationsDocument = HydratedDocument<UserIntegrations>;

@Schema({ collection: 'user_integrations', timestamps: true })
export class UserIntegrations {
  @Prop({ type: String, required: true, unique: true }) user_id!: string;

  @Prop({ type: GarminCredsSchema, default: null })
  garmin!: GarminCreds | null;

  @Prop({ type: GoogleCalendarCredsSchema, default: null })
  google_calendar!: GoogleCalendarCreds | null;

  @Prop({ type: TelegramCredsSchema, default: null })
  telegram!: TelegramCreds | null;
}

export const UserIntegrationsSchema =
  SchemaFactory.createForClass(UserIntegrations);
