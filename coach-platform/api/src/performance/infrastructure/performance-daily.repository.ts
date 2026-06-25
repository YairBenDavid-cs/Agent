import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { PerformanceDay } from '../domain/performance-day.model';
import { PerformanceDailyRepositoryPort } from '../domain/performance.repository.port';
import { PerformanceDaily } from './performance-daily.schema';

const toPersistence = (day: PerformanceDay): PerformanceDaily => ({
  user_id: day.userId,
  date: day.date,
  source: day.source,
  content_hash: day.contentHash,
  ingestion_status: day.ingestionStatus,
  warnings: day.warnings,
  running: day.metrics.running,
  strength: day.metrics.strength,
});

const toDomain = (doc: PerformanceDaily): PerformanceDay => ({
  userId: doc.user_id,
  date: doc.date,
  source: doc.source,
  contentHash: doc.content_hash,
  ingestionStatus: doc.ingestion_status,
  warnings: doc.warnings ?? [],
  metrics: { running: doc.running, strength: doc.strength },
});

@Injectable()
export class PerformanceDailyRepository
  extends BaseTenantRepository<PerformanceDaily>
  implements PerformanceDailyRepositoryPort
{
  constructor(
    @InjectModel(PerformanceDaily.name) model: Model<PerformanceDaily>,
  ) {
    super(model);
  }

  async upsertDay(day: PerformanceDay): Promise<void> {
    await this.upsertScoped(
      day.userId,
      { date: day.date },
      { $set: toPersistence(day) },
    );
  }

  async getContentHash(userId: string, date: string): Promise<string | null> {
    const doc = await this.findOneScoped(userId, { date });
    return doc?.content_hash ?? null;
  }

  async findRange(
    userId: string,
    from: string,
    to: string,
    afterDate: string | null,
    limit: number,
  ): Promise<PerformanceDay[]> {
    const dateFilter: Record<string, string> = { $gte: from, $lte: to };
    if (afterDate) {
      dateFilter.$gt = afterDate;
    }
    const docs = await this.findManyScoped(
      userId,
      { date: dateFilter },
      { date: 1 },
      limit,
    );
    return docs.map(toDomain);
  }
}
