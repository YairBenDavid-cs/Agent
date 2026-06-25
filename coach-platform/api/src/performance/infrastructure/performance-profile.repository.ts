import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { PerformanceProfileRepositoryPort } from '../domain/performance.repository.port';
import {
  ProfileMetricChange,
  ProfileMetricCurrent,
} from '../domain/profile-change.model';
import { PerformanceProfileEntry } from './performance-profile.schema';

const toDomain = (doc: PerformanceProfileEntry): ProfileMetricChange => ({
  userId: doc.user_id,
  metric: doc.metric,
  value: doc.value,
  effectiveDate: doc.effective_date,
  source: doc.source,
});

@Injectable()
export class PerformanceProfileRepository
  extends BaseTenantRepository<PerformanceProfileEntry>
  implements PerformanceProfileRepositoryPort
{
  constructor(
    @InjectModel(PerformanceProfileEntry.name)
    model: Model<PerformanceProfileEntry>,
  ) {
    super(model);
  }

  async getLatestValue(userId: string, metric: string): Promise<number | null> {
    const doc = await this.model
      .findOne(this.scoped(userId, { metric }))
      .sort({ effective_date: -1 })
      .lean<PerformanceProfileEntry>()
      .exec();
    return doc?.value ?? null;
  }

  async appendChange(change: ProfileMetricChange): Promise<void> {
    // Upsert on the unique (user, metric, date) key so re-running the same day
    // overwrites rather than throwing a duplicate-key error.
    await this.upsertScoped(
      change.userId,
      { metric: change.metric, effective_date: change.effectiveDate },
      {
        $set: { value: change.value, source: change.source },
        $setOnInsert: {
          user_id: change.userId,
          metric: change.metric,
          effective_date: change.effectiveDate,
        },
      },
    );
  }

  async getCurrentProfile(userId: string): Promise<ProfileMetricCurrent[]> {
    const rows = await this.model
      .aggregate<ProfileMetricCurrent>(
        this.tenantPipeline(userId, [
          { $sort: { metric: 1, effective_date: -1 } },
          {
            $group: {
              _id: '$metric',
              metric: { $first: '$metric' },
              value: { $first: '$value' },
              effectiveDate: { $first: '$effective_date' },
            },
          },
          { $project: { _id: 0, metric: 1, value: 1, effectiveDate: 1 } },
          { $sort: { metric: 1 } },
        ]),
      )
      .exec();
    return rows;
  }

  async findMetricHistory(
    userId: string,
    metric: string,
  ): Promise<ProfileMetricChange[]> {
    const docs = await this.findManyScoped(
      userId,
      { metric },
      { effective_date: 1 },
    );
    return docs.map(toDomain);
  }
}
