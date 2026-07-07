import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import {
  ReviseWeeklyTargetsCommand,
  ReviseWeeklyTargetsResult,
} from './revise-weekly-targets.command';

/**
 * Revises Step A on a week that is already `targets_locked` or `locked` — the
 * reactive-edit path. Rejects an `open` week (nothing locked yet to revise).
 * Ownership + existence are checked by a tenant-scoped read, mirroring
 * `LockWeeklyTargetsHandler`.
 */
@CommandHandler(ReviseWeeklyTargetsCommand)
export class ReviseWeeklyTargetsHandler
  implements
    ICommandHandler<ReviseWeeklyTargetsCommand, ReviseWeeklyTargetsResult>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(
    command: ReviseWeeklyTargetsCommand,
  ): Promise<ReviseWeeklyTargetsResult> {
    const {
      userId,
      programId,
      weekIndex,
      sessionCount,
      totalVolume,
      keyGoals,
      reason,
      triggeredBy,
    } = command;

    const program = await this.repository.findById(userId, programId);
    if (!program) {
      throw ApiError.notFound('Program not found.', { programId });
    }

    const week = program.weeks.find((w) => w.weekIndex === weekIndex);
    if (!week) {
      throw ApiError.notFound('Program week not found.', {
        programId,
        weekIndex,
      });
    }

    const state = week.weekState ?? 'open';
    if (state === 'open') {
      throw ApiError.badRequest(
        `Week ${weekIndex} has no locked targets to revise (state: ${state}).`,
        { programId, weekIndex, weekState: state },
      );
    }

    if (!week.weeklyTargets) {
      throw ApiError.badRequest(
        `Week ${weekIndex} has no weekly targets to revise.`,
        { programId, weekIndex },
      );
    }

    await this.repository.reviseWeeklyTargets(
      userId,
      programId,
      weekIndex,
      { sessionCount, totalVolume, keyGoals },
      {
        revisedAt: new Date().toISOString(),
        previous: {
          sessionCount: week.weeklyTargets.sessionCount,
          totalVolume: week.weeklyTargets.totalVolume,
          keyGoals: week.weeklyTargets.keyGoals,
        },
        reason,
        triggeredBy,
      },
    );

    return { revised: true, weekIndex };
  }
}
