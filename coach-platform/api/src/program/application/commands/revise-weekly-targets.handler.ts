import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../../planned-sessions/domain/planned-session.repository.port';
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
 * Two additional invariants (both fail-closed, clear message not a crash):
 * a `locked` week is closed to ANY direct mutation, including a target
 * revision — the athlete's completed week is a historical record; and a
 * `direct_target_change` (Flow B, which reflows the whole week's sessions)
 * is refused once ANY session in the week is already `committed` — reflowing
 * would silently rewrite a session the athlete already reviewed. A
 * `session_edit`-triggered revision (Flow A's cascade) is exempt from the
 * committed-session check: it never touches other sessions.
 */
@CommandHandler(ReviseWeeklyTargetsCommand)
export class ReviseWeeklyTargetsHandler
  implements
    ICommandHandler<ReviseWeeklyTargetsCommand, ReviseWeeklyTargetsResult>
{
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repository: ProgramRepositoryPort,
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly plannedSessions: PlannedSessionRepositoryPort,
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

    if (state === 'locked') {
      throw ApiError.badRequest(
        `Week ${weekIndex} is fully locked (every session committed); it is a ` +
          'historical record and its targets can no longer be revised.',
        { programId, weekIndex, weekState: state },
      );
    }

    if (!week.weeklyTargets) {
      throw ApiError.badRequest(
        `Week ${weekIndex} has no weekly targets to revise.`,
        { programId, weekIndex },
      );
    }

    if (triggeredBy === 'direct_target_change') {
      const sessions = await this.plannedSessions.findByWeek(
        userId,
        programId,
        weekIndex,
      );
      const hasCommitted = sessions.some((s) => s.planState === 'committed');
      if (hasCommitted) {
        throw ApiError.badRequest(
          `Week ${weekIndex} already has committed sessions; a direct target ` +
            'change would reflow (and silently overwrite) sessions the athlete ' +
            'already reviewed. Edit individual sessions instead.',
          { programId, weekIndex, weekState: state },
        );
      }
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
