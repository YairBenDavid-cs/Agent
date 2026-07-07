import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../domain/program.repository.port';
import {
  AdvanceCurrentWeekCommand,
  AdvanceCurrentWeekResult,
} from './advance-current-week.command';

/**
 * Flips the program's current-week pointer forward. Refuses to advance while
 * the current week's targets aren't locked yet (still mid-build) — advancing
 * early would strand an in-flight build conversation pointed at a week that's
 * no longer "current".
 */
@CommandHandler(AdvanceCurrentWeekCommand)
export class AdvanceCurrentWeekHandler
  implements ICommandHandler<AdvanceCurrentWeekCommand, AdvanceCurrentWeekResult>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
  ) {}

  async execute(
    command: AdvanceCurrentWeekCommand,
  ): Promise<AdvanceCurrentWeekResult> {
    const { userId, programId, targetWeekIndex } = command;

    const program = await this.repository.findById(userId, programId);
    if (!program) {
      throw ApiError.notFound('Program not found.', { programId });
    }

    if (targetWeekIndex <= program.currentWeekIndex) {
      throw ApiError.badRequest(
        `Target week ${targetWeekIndex} is not ahead of the current week ${program.currentWeekIndex}.`,
        { programId, targetWeekIndex, currentWeekIndex: program.currentWeekIndex },
      );
    }

    const currentWeek = program.weeks.find(
      (w) => w.weekIndex === program.currentWeekIndex,
    );
    const targetWeek = program.weeks.find(
      (w) => w.weekIndex === targetWeekIndex,
    );
    if (!targetWeek) {
      throw ApiError.notFound('Target week not found in program skeleton.', {
        programId,
        targetWeekIndex,
      });
    }
    if (currentWeek && (currentWeek.weekState ?? 'open') !== 'locked') {
      throw ApiError.badRequest(
        `Current week ${program.currentWeekIndex} is not locked yet (state: ${
          currentWeek.weekState ?? 'open'
        }); cannot advance while its build is unfinished.`,
        { programId, currentWeekIndex: program.currentWeekIndex },
      );
    }

    const weeks = program.weeks.map((w) => {
      if (w.weekIndex === program.currentWeekIndex) {
        return { ...w, status: 'done' as const };
      }
      if (w.weekIndex === targetWeekIndex) {
        return { ...w, status: 'current' as const };
      }
      return w;
    });

    await this.repository.updateWeeks(
      userId,
      programId,
      weeks,
      targetWeekIndex,
    );

    return { advanced: true, currentWeekIndex: targetWeekIndex };
  }
}
