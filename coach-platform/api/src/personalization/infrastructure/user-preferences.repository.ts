import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { EventDiscipline } from '../domain/preference-event.model';
import { UserPreferences } from '../domain/user-preferences.model';
import { UserPreferencesRepositoryPort } from '../domain/user-preferences.repository.port';
import {
  toDomain,
  toPersistence,
  UserPreferencesLean,
} from './user-preferences.persistence-mapper';
import { UserPreferencesDoc } from './user-preferences.schema';

@Injectable()
export class UserPreferencesRepository
  extends BaseTenantRepository<UserPreferencesDoc>
  implements UserPreferencesRepositoryPort
{
  constructor(
    @InjectModel(UserPreferencesDoc.name) model: Model<UserPreferencesDoc>,
  ) {
    super(model);
  }

  async findByDiscipline(
    userId: string,
    discipline: EventDiscipline,
  ): Promise<UserPreferences | null> {
    const doc = (await this.findOneScoped(userId, {
      discipline,
    })) as UserPreferencesLean | null;
    return doc ? toDomain(doc) : null;
  }

  async findAll(userId: string): Promise<UserPreferences[]> {
    const docs = (await this.findManyScoped(
      userId,
      {},
      { discipline: 1 },
    )) as UserPreferencesLean[];
    return docs.map(toDomain);
  }

  async upsert(prefs: UserPreferences): Promise<void> {
    await this.upsertScoped(
      prefs.userId,
      { discipline: prefs.discipline },
      { $set: toPersistence(prefs) },
    );
  }
}
