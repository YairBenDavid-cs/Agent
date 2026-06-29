import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import {
  CommitSessionCommand,
  CommitSessionResult,
} from './commit-session.command';

/**
 * Commits a single train and persists its display diff. Ownership + existence
 * are verified by a tenant-scoped read before the write; the diff itself is
 * authored upstream (the agent tier diffs the before/after prescription).
 */
@CommandHandler(CommitSessionCommand)
export class CommitSessionHandler
  implements ICommandHandler<CommitSessionCommand, CommitSessionResult>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(command: CommitSessionCommand): Promise<CommitSessionResult> {
    const { userId, plannedSessionId, lastDiff } = command;

    const session = await this.repository.findById(userId, plannedSessionId);
    if (!session) {
      throw ApiError.notFound('Planned session not found.', {
        plannedSessionId,
      });
    }

    await this.repository.commitSession(userId, plannedSessionId, lastDiff);

    return { committed: true, plannedSessionId };
  }
}
