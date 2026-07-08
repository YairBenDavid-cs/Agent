import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../../common/errors/api-error';
import {
  GarminSyncSchedule,
  MAX_GARMIN_SYNC_TIMES,
} from '../../domain/garmin-sync-schedule.model';
import {
  GARMIN_SYNC_SCHEDULE_REPOSITORY,
  GarminSyncScheduleRepositoryPort,
} from '../../domain/garmin-sync-schedule.repository.port';
import { UpsertGarminSyncScheduleCommand } from './upsert-garmin-sync-schedule.command';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Saves the user's chosen sync times + mode. Validation lives here (not the
 * DTO) because "at most 3, deduped, valid HH:mm" is a domain rule, not just
 * shape — the DTO only checks each entry looks like a time string.
 */
@CommandHandler(UpsertGarminSyncScheduleCommand)
export class UpsertGarminSyncScheduleHandler
  implements ICommandHandler<UpsertGarminSyncScheduleCommand, GarminSyncSchedule>
{
  constructor(
    @Inject(GARMIN_SYNC_SCHEDULE_REPOSITORY)
    private readonly repository: GarminSyncScheduleRepositoryPort,
  ) {}

  async execute(
    command: UpsertGarminSyncScheduleCommand,
  ): Promise<GarminSyncSchedule> {
    const times = Array.from(new Set(command.syncTimesLocal));

    if (times.length === 0) {
      throw ApiError.badRequest('At least one sync time is required.');
    }
    if (times.length > MAX_GARMIN_SYNC_TIMES) {
      throw ApiError.badRequest(
        `At most ${MAX_GARMIN_SYNC_TIMES} sync times are allowed.`,
        { syncTimesLocal: command.syncTimesLocal },
      );
    }
    const invalid = times.filter((t) => !TIME_RE.test(t));
    if (invalid.length > 0) {
      throw ApiError.badRequest('Sync times must be "HH:mm".', { invalid });
    }

    return this.repository.upsert({
      userId: command.userId,
      syncTimesLocal: times.sort(),
      mode: command.mode,
      enabled: command.enabled,
    });
  }
}
