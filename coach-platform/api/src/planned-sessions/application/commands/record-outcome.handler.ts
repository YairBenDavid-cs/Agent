import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiError } from '../../../common/errors/api-error';
import { PlannedOutcome } from '../../domain/planned-session.model';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  OUTCOME_RECORDED,
  OutcomeRecordedEvent,
} from '../events/outcome-recorded.event';
import { RecordOutcomeCommand } from './record-outcome.command';

@CommandHandler(RecordOutcomeCommand)
export class RecordOutcomeHandler
  implements ICommandHandler<RecordOutcomeCommand, { recorded: true }>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
    private readonly events: EventEmitter2,
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

    // Seam for the personalization layer to learn from skips/deviations.
    this.events.emit(
      OUTCOME_RECORDED,
      new OutcomeRecordedEvent({
        userId,
        plannedSessionId,
        discipline: existing.type,
        reasonCode: outcome.reasonCode,
        status: outcome.status,
        scheduledDate: existing.scheduledDate,
        startTime: existing.startTime,
        endTime: existing.endTime,
      }),
    );

    return { recorded: true };
  }
}
