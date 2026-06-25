import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuthSessionDocument = HydratedDocument<AuthSession>;

/** Refresh-token sessions: one per login, looked up by jti, listed by user. */
@Schema({ collection: 'auth_sessions', timestamps: true })
export class AuthSession {
  @Prop({ type: String, required: true, index: true }) user_id!: string;
  @Prop({ type: String, required: true, unique: true }) jti!: string;
  @Prop({ type: String, required: true }) refresh_token_hash!: string;
  @Prop({ type: String, required: true }) expires_at!: string;
  @Prop({ type: String, default: null }) revoked_at!: string | null;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);

// Mongo TTL-free; expiry is enforced in the refresh flow. A compound index keeps
// "active sessions for a user" cheap.
AuthSessionSchema.index({ user_id: 1, revoked_at: 1 });
