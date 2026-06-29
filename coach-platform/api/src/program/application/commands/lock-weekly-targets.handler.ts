import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import {
  LockWeeklyTargetsCommand,
  LockWeeklyTargetsResult,
} from './lock-weekly-targets.command';

/**
 * Freezes Step A on one week. Ownership + existence are checked by a
 * tenant-scoped read; immutability is enforced here — a week that is already
 * `targets_locked` or `locked` is refused, so a frozen quota is never silently
 * rewritten (changes must flow through a reactive re-plan instead).
 */
@CommandHandler(LockWeeklyTargetsCommand)
export class LockWeeklyTargetsHandler
  implements ICommandHandler<LockWeeklyTargetsCommand, LockWeeklyTargetsResult>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(
    command: LockWeeklyTargetsCommand,
  ): Promise<LockWeeklyTargetsResult> {
    const {
      userId,
      programId,
      weekIndex,
      sessionCount,
      totalVolume,
      keyGoals,
      lockedAt,
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
    if (state !== 'open') {
      throw ApiError.badRequest(
        `Week ${weekIndex} targets are already locked (state: ${state}).`,
        { programId, weekIndex, weekState: state },
      );
    }

    await this.repository.lockWeeklyTargets(userId, programId, weekIndex, {
      sessionCount,
      totalVolume,
      keyGoals,
      lockedAt,
    });

    return { locked: true, weekIndex };
  }
}
