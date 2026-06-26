import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import { PlannedOutcome } from '../../domain/planned-session.model';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import { RecordOutcomeCommand } from './record-outcome.command';

@CommandHandler(RecordOutcomeCommand)
export class RecordOutcomeHandler
  implements ICommandHandler<RecordOutcomeCommand, { recorded: true }>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(command: RecordOutcomeCommand): Promise<{ recorded: true }> {
    const { userId, plannedSessionId, dto } = command;

    // Ownership / existence check before write (tenant-scoped read).
    const existing = await this.repository.findById(userId, plannedSessionId);
    if (!existing) {
      throw ApiError.notFound('Planned session not found.', {
        plannedSessionId,
      });
    }

    const outcome: PlannedOutcome = {
      status: dto.status,
      reasonCode: dto.reasonCode ?? null,
      perceivedEffort: dto.perceivedEffort ?? null,
      enjoyment: dto.enjoyment ?? null,
      matchedActivityId: dto.matchedActivityId ?? null,
      feedbackRef: dto.feedbackRef ?? null,
      recordedAt: new Date().toISOString(),
    };

    await this.repository.updateOutcome(userId, plannedSessionId, outcome);
    return { recorded: true };
  }
}
