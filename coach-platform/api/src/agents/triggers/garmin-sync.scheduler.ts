import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestionOrchestrator } from '../../ingestion/application/ingestion.orchestrator';
import { GetGarminSyncScheduleQuery } from '../../ingestion/garmin-sync-schedule/application/queries/get-garmin-sync-schedule.query';
import { GarminSyncSchedule } from '../../ingestion/garmin-sync-schedule/domain/garmin-sync-schedule.model';
import {
  GARMIN_SYNC_SCHEDULE_REPOSITORY,
  GarminSyncScheduleRepositoryPort,
} from '../../ingestion/garmin-sync-schedule/domain/garmin-sync-schedule.repository.port';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../users/domain/users.repository.port';
import { GetUserQuery } from '../../users/application/queries/get-user.query';
import { UserResponse } from '../../users/application/dto/user.response';
import { GARMIN_SYNC_RUN_ID_PREFIX } from '../shared/queue/events/garmin-sync-batch-recorded.event';
import { FetchTrigger } from './fetch.trigger';

/** Local "HH:mm" and "YYYY-MM-DD" for `tz`, read off one `Intl` pass. */
function localClock(tz: string, now: Date): { hhmm: string; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    hhmm: `${get('hour')}:${get('minute')}`,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/**
 * Fires the user-configured Garmin sync (up to 3x/day, at the local times the
 * user picked in Settings). Replaces the old fixed 4am ingestion cron + fixed
 * 5am session-day fetch cron with one per-user, per-minute sweep: reads live
 * state at fire time (never trusting anything cached), so a user who changes
 * their sync times or timezone sees it take effect on the very next tick.
 *
 * Each fire does two things, matching what the old two crons did an hour
 * apart from each other, but now deterministically chained:
 *  1. `IngestionOrchestrator.runForUser` — pull fresh Garmin data.
 *  2. `FetchTrigger.runForUser` — enqueue FULL_SESSION_DAY (Recovery gate →
 *     Coach → Planner) tagged with a `garmin-sync:` runId, so
 *     `PipelineQueue.maybeRecordBatch` can attribute the resulting pending
 *     card batch back to this sync and gate Plan vs Auto mode on it.
 */
@Injectable()
export class GarminSyncScheduler {
  private readonly logger = new Logger(GarminSyncScheduler.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly users: UsersRepositoryPort,
    @Inject(GARMIN_SYNC_SCHEDULE_REPOSITORY)
    private readonly schedules: GarminSyncScheduleRepositoryPort,
    private readonly queryBus: QueryBus,
    private readonly orchestrator: IngestionOrchestrator,
    private readonly fetchTrigger: FetchTrigger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(now: Date = new Date()): Promise<void> {
    const userIds = await this.users.findActiveIds();
    for (const userId of userIds) {
      try {
        await this.maybeFire(userId, now);
      } catch (err) {
        this.logger.error(
          `Garmin sync sweep failed for ${userId}: ${String(err)}`,
        );
      }
    }
  }

  private async maybeFire(userId: string, now: Date): Promise<void> {
    const schedule = await this.queryBus.execute<
      GetGarminSyncScheduleQuery,
      GarminSyncSchedule
    >(new GetGarminSyncScheduleQuery(userId));
    if (!schedule.enabled) {
      return;
    }

    const user = await this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(userId),
    );
    const { hhmm, date } = localClock(user.timezone ?? 'UTC', now);

    const due = schedule.syncTimesLocal.find(
      (t) => t === hhmm && schedule.lastFiredAt[t] !== date,
    );
    if (!due) {
      return;
    }

    // Claim the slot before doing any work — a slow run must never fire twice
    // if the sweep overlaps its own tick.
    await this.schedules.markFired(userId, due, date);

    this.logger.log(`Garmin sync firing for ${userId} at ${due} (${date}).`);
    await this.orchestrator.runForUser(userId);
    await this.fetchTrigger.runForUser(
      userId,
      date,
      `${GARMIN_SYNC_RUN_ID_PREFIX}:${userId}:${date}:${due}`,
    );
  }
}
