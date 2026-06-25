import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { contentHash } from '../../../common/util/content-hash';
import { RecoveryDay } from '../../domain/recovery-day.model';
import {
  RECOVERY_REPOSITORY,
  RecoveryRepositoryPort,
} from '../../domain/recovery.repository.port';
import {
  UpsertRecoveryDayCommand,
  UpsertResult,
} from './upsert-recovery-day.command';

@CommandHandler(UpsertRecoveryDayCommand)
export class UpsertRecoveryDayHandler
  implements ICommandHandler<UpsertRecoveryDayCommand, UpsertResult>
{
  constructor(
    @Inject(RECOVERY_REPOSITORY)
    private readonly repository: RecoveryRepositoryPort,
  ) {}

  async execute(command: UpsertRecoveryDayCommand): Promise<UpsertResult> {
    // Idempotency guard: hash the metrics only. Identical readings => skip the
    // write so re-running the fetcher for the same day causes no churn.
    const hash = contentHash(command.metrics);
    const existing = await this.repository.getContentHash(
      command.userId,
      command.date,
    );
    if (existing === hash) {
      return { written: false };
    }

    const day: RecoveryDay = {
      userId: command.userId,
      date: command.date,
      source: command.source,
      contentHash: hash,
      ingestionStatus: command.ingestionStatus,
      warnings: command.warnings,
      metrics: command.metrics,
    };
    await this.repository.upsertDay(day);
    return { written: true };
  }
}
