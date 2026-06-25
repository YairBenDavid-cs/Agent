import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Sex, Units, UserRole, UserStatus } from '../domain/user.model';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ type: String, required: true, unique: true }) user_id!: string;
  @Prop({ type: String, required: true, unique: true }) email!: string;
  @Prop({ type: String, required: true }) name!: string;

  // Profile fields below are captured during onboarding, not at signup.
  @Prop({ type: String, default: null }) date_of_birth!: string | null;

  @Prop({ type: String, default: null, enum: ['male', 'female', 'other', null] })
  sex!: Sex | null;

  @Prop({ type: String, default: null }) country!: string | null;
  @Prop({ type: String, default: null }) timezone!: string | null;
  @Prop({ type: String, required: true, default: 'en' }) locale!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['metric', 'imperial'],
    default: 'metric',
  })
  units!: Units;

  @Prop({ type: Number, default: null }) height_cm!: number | null;
  @Prop({ type: Number, default: null }) weight_kg!: number | null;

  @Prop({
    type: String,
    required: true,
    enum: ['active', 'disabled'],
    default: 'active',
  })
  status!: UserStatus;

  @Prop({ type: String, required: true, enum: ['user', 'admin'], default: 'user' })
  role!: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);
