import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { HealthConstraint } from '../domain/health-constraint.model';
import { HealthConstraintRepositoryPort } from '../domain/health-constraint.repository.port';
import {
  HealthConstraintLean,
  toDomain,
  toPersistence,
} from './health-constraint.persistence-mapper';
import { HealthConstraintDoc } from './health-constraint.schema';

@Injectable()
export class HealthConstraintRepository
  extends BaseTenantRepository<HealthConstraintDoc>
  implements HealthConstraintRepositoryPort
{
  constructor(
    @InjectModel(HealthConstraintDoc.name) model: Model<HealthConstraintDoc>,
  ) {
    super(model);
  }

  async add(constraint: HealthConstraint): Promise<string> {
    const created = await this.model.create(toPersistence(constraint));
    return created._id.toString();
  }

  async findActive(userId: string): Promise<HealthConstraint[]> {
    const docs = (await this.findManyScoped(
      userId,
      { status: 'active' },
      { noted_at: -1 },
    )) as HealthConstraintLean[];
    return docs.map(toDomain);
  }

  async findAll(userId: string): Promise<HealthConstraint[]> {
    const docs = (await this.findManyScoped(
      userId,
      {},
      { noted_at: -1 },
    )) as HealthConstraintLean[];
    return docs.map(toDomain);
  }

  async findById(
    userId: string,
    constraintId: string,
  ): Promise<HealthConstraint | null> {
    const doc = (await this.findOneScoped(userId, {
      _id: constraintId,
    })) as HealthConstraintLean | null;
    return doc ? toDomain(doc) : null;
  }

  async resolve(
    userId: string,
    constraintId: string,
    resolvedAt: string,
  ): Promise<void> {
    await this.model
      .updateOne(this.scoped(userId, { _id: constraintId }), {
        $set: { status: 'resolved', resolved_at: resolvedAt },
      })
      .exec();
  }
}
