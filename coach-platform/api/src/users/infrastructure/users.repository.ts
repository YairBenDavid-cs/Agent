import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getActiveSession } from '../../common/transaction/transaction.context';
import { UserProfilePatch } from '../application/commands/update-user-profile.command';
import { UserProfile } from '../domain/user.model';
import { UsersRepositoryPort } from '../domain/users.repository.port';
import { User } from './user.schema';

const toDomain = (doc: User): UserProfile => ({
  userId: doc.user_id,
  email: doc.email,
  name: doc.name,
  dateOfBirth: doc.date_of_birth,
  sex: doc.sex,
  country: doc.country,
  timezone: doc.timezone,
  locale: doc.locale,
  units: doc.units,
  heightCm: doc.height_cm,
  weightKg: doc.weight_kg,
  status: doc.status,
  role: doc.role,
  autoModeOptIn: doc.auto_mode_opt_in,
});

const toPersistence = (p: UserProfile): User => ({
  user_id: p.userId,
  email: p.email,
  name: p.name,
  date_of_birth: p.dateOfBirth,
  sex: p.sex,
  country: p.country,
  timezone: p.timezone,
  locale: p.locale,
  units: p.units,
  height_cm: p.heightCm,
  weight_kg: p.weightKg,
  status: p.status,
  role: p.role,
  auto_mode_opt_in: p.autoModeOptIn,
});

@Injectable()
export class UsersRepository implements UsersRepositoryPort {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  async create(profile: UserProfile): Promise<void> {
    // Enroll in the ambient transaction if one is active (e.g. registration).
    const session = getActiveSession();
    await this.model.create([toPersistence(profile)], { session });
  }

  async findById(userId: string): Promise<UserProfile | null> {
    const doc = await this.model.findOne({ user_id: userId }).lean<User>().exec();
    return doc ? toDomain(doc) : null;
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    // Read within the active transaction so the register uniqueness check is
    // consistent with the subsequent insert.
    const doc = await this.model
      .findOne({ email })
      .session(getActiveSession() ?? null)
      .lean<User>()
      .exec();
    return doc ? toDomain(doc) : null;
  }

  async findActiveIds(): Promise<string[]> {
    const docs = await this.model
      .find({ status: 'active' }, { user_id: 1, _id: 0 })
      .lean<{ user_id: string }[]>()
      .exec();
    return docs.map((d) => d.user_id);
  }

  async updateProfileFields(
    userId: string,
    patch: UserProfilePatch,
  ): Promise<boolean> {
    // Map the narrow camelCase patch to snake_case columns, skipping `undefined`
    // (leave as-is) while honoring explicit `null` (clear an optional field).
    const set: Record<string, unknown> = {};
    if (patch.sex !== undefined) set.sex = patch.sex;
    if (patch.dateOfBirth !== undefined) set.date_of_birth = patch.dateOfBirth;
    if (patch.country !== undefined) set.country = patch.country;
    if (patch.timezone !== undefined) set.timezone = patch.timezone;
    if (patch.heightCm !== undefined) set.height_cm = patch.heightCm;
    if (patch.weightKg !== undefined) set.weight_kg = patch.weightKg;
    if (patch.autoModeOptIn !== undefined) set.auto_mode_opt_in = patch.autoModeOptIn;

    if (Object.keys(set).length === 0) {
      // Nothing to change — confirm the user exists so callers get a truthful result.
      const exists = await this.model
        .exists({ user_id: userId })
        .session(getActiveSession() ?? null)
        .exec();
      return exists != null;
    }

    const result = await this.model
      .updateOne(
        { user_id: userId },
        { $set: set },
        { session: getActiveSession() },
      )
      .exec();
    return result.matchedCount > 0;
  }
}
