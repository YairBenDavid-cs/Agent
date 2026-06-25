import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../common/infrastructure/base-tenant.repository';
import { RecoveryDay } from '../domain/recovery-day.model';
import { RecoveryRepositoryPort } from '../domain/recovery.repository.port';
import { RecoveryDaily } from './recovery-daily.schema';
import { toDomain, toPersistence } from './recovery.persistence-mapper';

@Injectable()
export class RecoveryRepository
  extends BaseTenantRepository<RecoveryDaily>
  implements RecoveryRepositoryPort
{
  constructor(
    @InjectModel(RecoveryDaily.name) model: Model<RecoveryDaily>,
  ) {
    super(model);
  }

  async upsertDay(day: RecoveryDay): Promise<void> {
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
  ): Promise<RecoveryDay[]> {
    // ISO YYYY-MM-DD sorts chronologically as a string, so a cursor on `date`
    // gives a stable total ordering for pagination.
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
