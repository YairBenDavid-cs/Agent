import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  UpdateCalendarSyncCommand,
  UpdateCalendarSyncResult,
} from './update-calendar-sync.command';

@CommandHandler(UpdateCalendarSyncCommand)
export class UpdateCalendarSyncHandler
  implements
    ICommandHandler<UpdateCalendarSyncCommand, UpdateCalendarSyncResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(
    command: UpdateCalendarSyncCommand,
  ): Promise<UpdateCalendarSyncResult> {
    const { userId, plannedSessionId, calendarSync } = command;

    const existing = await this.repository.findById(userId, plannedSessionId);
    if (!existing) {
      throw ApiError.notFound('Planned session not found.', {
        plannedSessionId,
      });
    }

    await this.repository.updateCalendarSync(
      userId,
      plannedSessionId,
      calendarSync,
    );
    return { updated: true };
  }
}
