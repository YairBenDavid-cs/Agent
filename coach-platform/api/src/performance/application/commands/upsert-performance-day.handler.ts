import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { contentHash } from '../../../common/util/content-hash';
import { PerformanceDay } from '../../domain/performance-day.model';
import {
  PERFORMANCE_DAILY_REPOSITORY,
  PerformanceDailyRepositoryPort,
} from '../../domain/performance.repository.port';
import {
  UpsertPerformanceDayCommand,
  UpsertResult,
} from './upsert-performance-day.command';

@CommandHandler(UpsertPerformanceDayCommand)
export class UpsertPerformanceDayHandler
  implements ICommandHandler<UpsertPerformanceDayCommand, UpsertResult>
{
  constructor(
    @Inject(PERFORMANCE_DAILY_REPOSITORY)
    private readonly repository: PerformanceDailyRepositoryPort,
  ) {}

  async execute(command: UpsertPerformanceDayCommand): Promise<UpsertResult> {
    const hash = contentHash(command.metrics);
    const existing = await this.repository.getContentHash(
      command.userId,
      command.date,
    );
    if (existing === hash) {
      return { written: false };
    }

    const day: PerformanceDay = {
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
