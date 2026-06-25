import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuthCredentialsDocument = HydratedDocument<AuthCredentials>;

/** Password hashes at rest. Separate collection, one row per user. */
@Schema({ collection: 'auth_credentials', timestamps: true })
export class AuthCredentials {
  @Prop({ type: String, required: true, unique: true }) user_id!: string;
  @Prop({ type: String, required: true }) password_hash!: string;
  @Prop({ type: String, required: true }) algo!: string;
}

export const AuthCredentialsSchema =
  SchemaFactory.createForClass(AuthCredentials);
