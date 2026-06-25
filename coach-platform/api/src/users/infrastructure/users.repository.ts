import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
});

@Injectable()
export class UsersRepository implements UsersRepositoryPort {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  async create(profile: UserProfile): Promise<void> {
    await this.model.create(toPersistence(profile));
  }

  async findById(userId: string): Promise<UserProfile | null> {
    const doc = await this.model.findOne({ user_id: userId }).lean<User>().exec();
    return doc ? toDomain(doc) : null;
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const doc = await this.model.findOne({ email }).lean<User>().exec();
    return doc ? toDomain(doc) : null;
  }

  async findActiveIds(): Promise<string[]> {
    const docs = await this.model
      .find({ status: 'active' }, { user_id: 1, _id: 0 })
      .lean<{ user_id: string }[]>()
      .exec();
    return docs.map((d) => d.user_id);
  }
}
