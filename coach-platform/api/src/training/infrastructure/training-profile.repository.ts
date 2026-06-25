import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { getActiveSession } from '../../common/transaction/transaction.context';
import { TrainingProfile as TrainingProfileModel } from '../domain/training-profile.model';
import { TrainingProfileRepositoryPort } from '../domain/training-profile.repository.port';
import { toDomain, toPersistence } from './training-profile.persistence-mapper';
import { TrainingProfile } from './training-profile.schema';

@Injectable()
export class TrainingProfileRepository
  extends BaseTenantRepository<TrainingProfile>
  implements TrainingProfileRepositoryPort
{
  constructor(
    @InjectModel(TrainingProfile.name) model: Model<TrainingProfile>,
  ) {
    super(model);
  }

  async findActive(userId: string): Promise<TrainingProfileModel | null> {
    const doc = await this.findOneScoped(userId, { status: 'active' });
    return doc ? toDomain(doc) : null;
  }

  /**
   * Archive-then-insert. Both writes enroll in the ambient transaction (started
   * by the command handler), so the partial-unique index on active profiles is
   * never violated: the old active row is demoted to 'completed' before the new
   * one is inserted, and either both happen or neither does.
   */
  async replaceActive(profile: TrainingProfileModel): Promise<void> {
    const session = getActiveSession();

    await this.model
      .updateMany(
        this.scoped(profile.userId, { status: 'active' }),
        { $set: { status: 'completed', completed_at: new Date().toISOString() } },
        { session },
      )
      .exec();

    await this.model.create([toPersistence(profile)], { session });
  }
}
