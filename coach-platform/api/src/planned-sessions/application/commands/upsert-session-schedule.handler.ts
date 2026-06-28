import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  UpsertSessionScheduleCommand,
  UpsertSessionScheduleResult,
} from './upsert-session-schedule.command';

@CommandHandler(UpsertSessionScheduleCommand)
export class UpsertSessionScheduleHandler
  implements
    ICommandHandler<UpsertSessionScheduleCommand, UpsertSessionScheduleResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(
    command: UpsertSessionScheduleCommand,
  ): Promise<UpsertSessionScheduleResult> {
    const { userId, plannedSessionId, schedule } = command;

    const existing = await this.repository.findById(userId, plannedSessionId);
    if (!existing) {
      throw ApiError.notFound('Planned session not found.', {
        plannedSessionId,
      });
    }

    await this.repository.updateSchedule(userId, plannedSessionId, schedule);
    return { scheduled: true };
  }
}
