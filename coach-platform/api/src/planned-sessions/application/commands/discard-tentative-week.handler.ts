import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  DiscardTentativeWeekCommand,
  DiscardTentativeWeekResult,
} from './discard-tentative-week.command';

@CommandHandler(DiscardTentativeWeekCommand)
export class DiscardTentativeWeekHandler
  implements
    ICommandHandler<DiscardTentativeWeekCommand, DiscardTentativeWeekResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(
    command: DiscardTentativeWeekCommand,
  ): Promise<DiscardTentativeWeekResult> {
    const { userId, programId, weekIndex } = command;
    const discarded = await this.repository.discardTentativeWeek(
      userId,
      programId,
      weekIndex,
    );
    return { discarded };
  }
}
