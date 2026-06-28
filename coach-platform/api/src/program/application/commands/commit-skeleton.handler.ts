import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import {
  CommitSkeletonCommand,
  CommitSkeletonResult,
} from './commit-skeleton.command';

/**
 * Persists a (re)generated periodization skeleton onto the caller's program.
 * Ownership is enforced by a tenant-scoped read before the write; the actual
 * shape of the weeks is the agent's responsibility (guardrail-validated inside
 * the Coach loop before this command ever fires).
 */
@CommandHandler(CommitSkeletonCommand)
export class CommitSkeletonHandler
  implements ICommandHandler<CommitSkeletonCommand, CommitSkeletonResult>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(command: CommitSkeletonCommand): Promise<CommitSkeletonResult> {
    const { userId, programId, weeks, currentWeekIndex } = command;

    const program = await this.repository.findById(userId, programId);
    if (!program) {
      throw ApiError.notFound('Program not found.', { programId });
    }

    await this.repository.updateWeeks(
      userId,
      programId,
      weeks,
      currentWeekIndex,
    );

    return { committed: true, weekCount: weeks.length };
  }
}
