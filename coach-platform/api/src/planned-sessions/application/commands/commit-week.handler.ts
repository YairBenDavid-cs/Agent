import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import { CommitWeekCommand, CommitWeekResult } from './commit-week.command';

@CommandHandler(CommitWeekCommand)
export class CommitWeekHandler
  implements ICommandHandler<CommitWeekCommand, CommitWeekResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(command: CommitWeekCommand): Promise<CommitWeekResult> {
    const { userId, programId, weekIndex } = command;
    const committed = await this.repository.commitWeek(
      userId,
      programId,
      weekIndex,
    );
    return { committed };
  }
}
