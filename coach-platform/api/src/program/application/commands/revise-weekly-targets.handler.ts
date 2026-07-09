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
 *
 * One additional invariant (fail-closed, clear message not a crash): a week
 * whose endDate has PASSED is a historical record, closed to any revision. A
 * merely `locked` week (fully built, every session committed) that is still
 * current stays revisable — a confirmed session edit cascades its target
 * revision through here.
 *
 * A `direct_target_change` (Flow B) is allowed even once some sessions in the
 * week are already `committed` — that's the normal shape of the CURRENT week
 * the athlete is asking to revise. It's safe: the downstream reflow
 * (`coach.generateWeek` → `replaceTentativeWeek`) only ever overwrites
 * `tentative` slots and leaves every `committed` session untouched, so an
 * already-reviewed session is never silently rewritten.
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

    // A 'locked' (fully built) week stays revisable while it is still current;
    // only a week that has already ENDED is a closed historical record.
    if (week.endDate < new Date().toISOString().slice(0, 10)) {
      throw ApiError.badRequest(
        `Week ${weekIndex} ended on ${week.endDate}; it is a historical ` +
          'record and its targets can no longer be revised.',
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
