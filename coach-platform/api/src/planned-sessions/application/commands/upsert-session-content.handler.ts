import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  UpsertSessionContentCommand,
  UpsertSessionContentResult,
} from './upsert-session-content.command';

/**
 * Writes a single train's content edit. Two invariants unique to content
 * edits (on top of the existence check shared with `CommitSessionHandler`):
 * a session whose outcome is already resolved, or one linked to a recorded
 * activity, is historical record — not an editable prescription.
 */
@CommandHandler(UpsertSessionContentCommand)
export class UpsertSessionContentHandler
  implements
    ICommandHandler<UpsertSessionContentCommand, UpsertSessionContentResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(
    command: UpsertSessionContentCommand,
  ): Promise<UpsertSessionContentResult> {
    const { userId, plannedSessionId, content, lastDiff } = command;

    const existing = await this.repository.findById(userId, plannedSessionId);
    if (!existing) {
      throw ApiError.notFound('Planned session not found.', {
        plannedSessionId,
      });
    }

    if (existing.outcome.status !== 'planned') {
      throw ApiError.badRequest(
        `Session already ${existing.outcome.status}; the prescription cannot be edited after the fact.`,
        { plannedSessionId, status: existing.outcome.status },
      );
    }

    if (existing.outcome.matchedActivityId != null) {
      throw ApiError.badRequest(
        'Session is linked to a recorded activity; edit blocked.',
        { plannedSessionId },
      );
    }

    await this.repository.updateContent(
      userId,
      plannedSessionId,
      content,
      lastDiff,
    );

    return { updated: true, plannedSessionId };
  }
}
