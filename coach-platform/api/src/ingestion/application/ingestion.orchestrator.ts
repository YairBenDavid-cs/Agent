import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UpsertRecoveryDayCommand } from '../../recovery/application/commands/upsert-recovery-day.command';
import { metricsFromDto as recoveryMetricsFromDto } from '../../recovery/application/recovery.mapper';
import { UpsertPerformanceDayCommand } from '../../performance/application/commands/upsert-performance-day.command';
import { AppendProfileChangesCommand } from '../../performance/application/commands/append-profile-changes.command';
import { metricsFromDto as performanceMetricsFromDto } from '../../performance/application/performance.mapper';
import { UpsertSessionCommand } from '../../sessions/application/commands/upsert-session.command';
import {
  runningFromDto,
  strengthFromDto,
} from '../../sessions/application/sessions.mapper';
import { IntegrationsService } from '../../integrations/application/integrations.service';
import { FetchedDayDto } from './dto/fetch-result.dto';
import {
  IngestionCompletedEvent,
  INGESTION_COMPLETED,
} from './events/ingestion-completed.event';
import { FetcherPort, GARMIN_FETCHER } from './fetcher.port';
import { GarminAuthError } from './ingestion.errors';
import { IngestionSummary } from './ingestion.summary';

/** Provenance stamped on every row this pipeline writes. */
const SOURCE = 'garmin';

/**
 * Sole coordinator of a wearable ingestion run. It owns NO persistence itself —
 * it fetches via the boundary port, then routes each slice to the owning context
 * through the CommandBus. content_hash idempotency in those handlers means a
 * re-run over unchanged data writes nothing.
 */
@Injectable()
export class IngestionOrchestrator {
  private readonly logger = new Logger(IngestionOrchestrator.name);

  constructor(
    @Inject(GARMIN_FETCHER) private readonly fetcher: FetcherPort,
    private readonly integrations: IntegrationsService,
    private readonly commandBus: CommandBus,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  /** Run for one tenant over [from, to]. Defaults to a config-driven backfill
   * window ending today when no range is given. */
  async runForUser(
    userId: string,
    range?: { from: string; to: string },
  ): Promise<IngestionSummary> {
    const { from, to } = range ?? this.defaultRange();

    await this.integrations.setGarminSyncStatus(userId, 'syncing');
    try {
      const auth = await this.integrations.getDecryptedGarminAuth(userId);
      const result = await this.fetcher.fetch({ userId, auth, from, to });

      // Cache a refreshed session so we are not re-authenticating every run.
      if (result.session) {
        await this.integrations.saveGarminSession(userId, result.session);
      }

      const summary: IngestionSummary = {
        userId,
        from,
        to,
        daysProcessed: 0,
        recoveryWritten: 0,
        performanceWritten: 0,
        sessionsWritten: 0,
        profileChangesAppended: 0,
        daysWithIssues: 0,
      };

      for (const day of result.days) {
        await this.ingestDay(userId, day, summary);
      }

      // A run that finished without throwing is a success — even with zero rows
      // (a brand-new account with no history is legitimately empty).
      await this.integrations.setGarminSyncStatus(userId, 'synced', {
        error: null,
        syncedAt: new Date().toISOString(),
      });
      this.events.emit(
        INGESTION_COMPLETED,
        new IngestionCompletedEvent(summary),
      );
      this.logger.log(
        `Ingestion for ${userId} [${from}..${to}]: ${JSON.stringify(summary)}`,
      );
      return summary;
    } catch (err) {
      // Auth rejection → user must re-enter credentials; anything else is
      // transient/persist failure → retryable with the stored token.
      const status = err instanceof GarminAuthError ? 'auth_failed' : 'sync_failed';
      await this.integrations.setGarminSyncStatus(userId, status, {
        error: String(err),
      });
      throw err;
    }
  }

  private async ingestDay(
    userId: string,
    day: FetchedDayDto,
    summary: IngestionSummary,
  ): Promise<void> {
    summary.daysProcessed += 1;
    if (day.status !== 'ok') summary.daysWithIssues += 1;

    const recovery = await this.commandBus.execute<
      UpsertRecoveryDayCommand,
      { written: boolean }
    >(
      new UpsertRecoveryDayCommand(
        userId,
        day.date,
        SOURCE,
        recoveryMetricsFromDto(day.recovery),
        day.status,
        day.warnings,
      ),
    );
    if (recovery.written) summary.recoveryWritten += 1;

    const performance = await this.commandBus.execute<
      UpsertPerformanceDayCommand,
      { written: boolean }
    >(
      new UpsertPerformanceDayCommand(
        userId,
        day.date,
        SOURCE,
        performanceMetricsFromDto(day.performance),
        day.status,
        day.warnings,
      ),
    );
    if (performance.written) summary.performanceWritten += 1;

    const profile = await this.commandBus.execute<
      AppendProfileChangesCommand,
      { appended: number; skipped: number }
    >(
      new AppendProfileChangesCommand(userId, SOURCE, day.profileCandidates),
    );
    summary.profileChangesAppended += profile.appended;

    for (const session of day.sessions) {
      const res = await this.commandBus.execute<
        UpsertSessionCommand,
        { written: boolean }
      >(
        new UpsertSessionCommand(
          userId,
          session.activityId,
          session.date,
          session.type,
          session.subtype ?? null,
          SOURCE,
          session.running ? runningFromDto(session.running) : null,
          session.strength ? strengthFromDto(session.strength) : null,
        ),
      );
      if (res.written) summary.sessionsWritten += 1;
    }
  }

  private defaultRange(): { from: string; to: string } {
    const days = this.config.get<number>('INGESTION_BACKFILL_DAYS') ?? 7;
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    return { from: isoDate(from), to: isoDate(to) };
  }
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
