import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  DEFAULT_GARMIN_SYNC_SCHEDULE,
  GarminSyncSchedule,
} from '../../domain/garmin-sync-schedule.model';
import {
  GARMIN_SYNC_SCHEDULE_REPOSITORY,
  GarminSyncScheduleRepositoryPort,
} from '../../domain/garmin-sync-schedule.repository.port';
import { GetGarminSyncScheduleQuery } from './get-garmin-sync-schedule.query';

/**
 * Reads the user's saved schedule, or the implicit default (once-daily 4am,
 * Plan mode) when they have never configured one — so every active user has
 * a schedule to sweep against without a migration/backfill step.
 */
@QueryHandler(GetGarminSyncScheduleQuery)
export class GetGarminSyncScheduleHandler
  implements IQueryHandler<GetGarminSyncScheduleQuery, GarminSyncSchedule>
{
  constructor(
    @Inject(GARMIN_SYNC_SCHEDULE_REPOSITORY)
    private readonly repository: GarminSyncScheduleRepositoryPort,
  ) {}

  async execute(
    query: GetGarminSyncScheduleQuery,
  ): Promise<GarminSyncSchedule> {
    const saved = await this.repository.findByUserId(query.userId);
    if (saved) {
      return saved;
    }
    const now = new Date().toISOString();
    return {
      userId: query.userId,
      ...DEFAULT_GARMIN_SYNC_SCHEDULE,
      createdAt: now,
      updatedAt: now,
    };
  }
}
