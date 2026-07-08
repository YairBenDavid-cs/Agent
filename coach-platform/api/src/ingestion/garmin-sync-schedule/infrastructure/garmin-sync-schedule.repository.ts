import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseTenantRepository } from '../../../common/infrastructure/base-tenant.repository';
import { GarminSyncSchedule } from '../domain/garmin-sync-schedule.model';
import {
  GarminSyncScheduleRepositoryPort,
  UpsertGarminSyncScheduleInput,
} from '../domain/garmin-sync-schedule.repository.port';
import { GarminSyncScheduleDoc } from './garmin-sync-schedule.schema';

type Lean = GarminSyncScheduleDoc & {
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class GarminSyncScheduleRepository
  extends BaseTenantRepository<GarminSyncScheduleDoc>
  implements GarminSyncScheduleRepositoryPort
{
  constructor(
    @InjectModel(GarminSyncScheduleDoc.name)
    model: Model<GarminSyncScheduleDoc>,
  ) {
    super(model);
  }

  async findByUserId(userId: string): Promise<GarminSyncSchedule | null> {
    const doc = (await this.findOneScoped(userId, {})) as Lean | null;
    return doc ? toDomain(doc) : null;
  }

  async upsert(
    input: UpsertGarminSyncScheduleInput,
  ): Promise<GarminSyncSchedule> {
    await this.upsertScoped(
      input.userId,
      {},
      {
        $set: {
          sync_times_local: input.syncTimesLocal,
          mode: input.mode,
          enabled: input.enabled,
        },
        $setOnInsert: { last_fired_at: {} },
      },
    );
    const doc = (await this.findOneScoped(input.userId, {})) as Lean;
    return toDomain(doc);
  }

  async markFired(
    userId: string,
    timeLocal: string,
    localDate: string,
  ): Promise<void> {
    // Upsert: a user who never saved their own schedule still needs the fire
    // recorded (they're running on `DEFAULT_GARMIN_SYNC_SCHEDULE`), so a
    // matching cron overlap doesn't double-fire for them either.
    await this.model
      .updateOne(
        this.scoped(userId, {}),
        {
          $set: { [`last_fired_at.${timeLocal}`]: localDate },
          $setOnInsert: {
            sync_times_local: [timeLocal],
            mode: 'plan',
            enabled: true,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}

function toDomain(d: Lean): GarminSyncSchedule {
  return {
    userId: d.user_id,
    syncTimesLocal: d.sync_times_local,
    mode: d.mode,
    enabled: d.enabled,
    lastFiredAt: d.last_fired_at ?? {},
    createdAt: (d.createdAt ?? new Date()).toISOString(),
    updatedAt: (d.updatedAt ?? new Date()).toISOString(),
  };
}
