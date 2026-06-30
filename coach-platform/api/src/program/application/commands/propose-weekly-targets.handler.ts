import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import {
  ProposeWeeklyTargetsCommand,
  ProposeWeeklyTargetsResult,
} from './propose-weekly-targets.command';

/**
 * Stages a tentative Step-A proposal on one week. Ownership + existence are
 * checked by a tenant-scoped read; only an `open` week accepts a proposal — once
 * targets are locked the quota is immutable (a re-plan must go through a reactive
 * edit), so proposing onto a `targets_locked`/`locked` week is refused.
 */
@CommandHandler(ProposeWeeklyTargetsCommand)
export class ProposeWeeklyTargetsHandler
  implements
    ICommandHandler<ProposeWeeklyTargetsCommand, ProposeWeeklyTargetsResult>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(
    command: ProposeWeeklyTargetsCommand,
  ): Promise<ProposeWeeklyTargetsResult> {
    const { userId, programId, weekIndex, sessionCount, totalVolume, keyGoals } =
      command;

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
        `Week ${weekIndex} targets are already locked (state: ${state}); ` +
          'cannot propose a new quota.',
        { programId, weekIndex, weekState: state },
      );
    }

    await this.repository.proposeWeeklyTargets(userId, programId, weekIndex, {
      sessionCount,
      totalVolume,
      keyGoals,
    });

    return { proposed: true, weekIndex };
  }
}
