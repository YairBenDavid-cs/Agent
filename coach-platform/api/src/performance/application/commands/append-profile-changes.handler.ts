import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  PERFORMANCE_PROFILE_REPOSITORY,
  PerformanceProfileRepositoryPort,
} from '../../domain/performance.repository.port';
import {
  AppendProfileChangesCommand,
  AppendProfileResult,
} from './append-profile-changes.command';

@CommandHandler(AppendProfileChangesCommand)
export class AppendProfileChangesHandler
  implements ICommandHandler<AppendProfileChangesCommand, AppendProfileResult>
{
  constructor(
    @Inject(PERFORMANCE_PROFILE_REPOSITORY)
    private readonly repository: PerformanceProfileRepositoryPort,
  ) {}

  async execute(
    command: AppendProfileChangesCommand,
  ): Promise<AppendProfileResult> {
    let appended = 0;
    let skipped = 0;

    // Append-on-change: a new log entry only when the value actually moved.
    // Scalars compare exactly; no hash needed.
    for (const candidate of command.candidates) {
      const latest = await this.repository.getLatestValue(
        command.userId,
        candidate.metric,
      );
      if (latest === candidate.value) {
        skipped += 1;
        continue;
      }
      await this.repository.appendChange({
        userId: command.userId,
        metric: candidate.metric,
        value: candidate.value,
        effectiveDate: candidate.effectiveDate,
        source: command.source,
      });
      appended += 1;
    }

    return { appended, skipped };
  }
}
