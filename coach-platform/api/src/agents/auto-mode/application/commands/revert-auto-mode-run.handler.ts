import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../../common/errors/api-error';
import { ProgramWeek } from '../../../../program/domain/program.model';
import { ReviseWeeklyTargetsCommand } from '../../../../program/application/commands/revise-weekly-targets.command';
import { PlannedSession } from '../../../../planned-sessions/domain/planned-session.model';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../../../planned-sessions/domain/planned-session.repository.port';
import { UpsertSessionContentCommand } from '../../../../planned-sessions/application/commands/upsert-session-content.command';
import { UpsertSessionScheduleCommand } from '../../../../planned-sessions/application/commands/upsert-session-schedule.command';
import { CalendarSyncService } from '../../../approval/calendar-sync.service';
import {
  AUTO_MODE_RUN_REPOSITORY,
  AutoModeRunRepositoryPort,
} from '../../domain/auto-mode-run.repository.port';
import { RevertAutoModeRunCommand, RevertAutoModeRunResult } from './revert-auto-mode-run.command';

/** The exact shape `AutoModeOrchestratorService.runAutoMode` writes as `beforeSnapshot`. */
interface AutoModeBeforeSnapshot {
  week: ProgramWeek;
  sessions: PlannedSession[];
}

/**
 * Compensating-write undo for one committed auto-mode run. Scoped to the 3
 * "edit" scenarios (`weekly_targets_edit`, `session_edit`, `session_time_edit`)
 * — each of those only ever restores fields in place via `updateContent`/
 * `updateSchedule`/`ReviseWeeklyTargetsCommand`, which matches the write
 * surface those flows used going forward. `new_week` is deliberately excluded:
 * its commit path flips tentative sessions to `committed`, and
 * `PlannedSessionRepositoryPort` has no bulk delete/replace for committed
 * sessions, so there is no safe compensating write for a full week generation.
 */
@CommandHandler(RevertAutoModeRunCommand)
export class RevertAutoModeRunHandler
  implements ICommandHandler<RevertAutoModeRunCommand, RevertAutoModeRunResult>
{
  constructor(
    @Inject(AUTO_MODE_RUN_REPOSITORY)
    private readonly runs: AutoModeRunRepositoryPort,
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly plannedSessions: PlannedSessionRepositoryPort,
    private readonly calendarSync: CalendarSyncService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: RevertAutoModeRunCommand): Promise<RevertAutoModeRunResult> {
    const { userId, runId } = command;
    const run = await this.runs.findByIdScoped(userId, runId);
    if (!run) {
      throw ApiError.notFound('Auto-mode run not found.', { runId });
    }

    // A user-requested undo only makes sense for a committed run. The
    // orchestrator's auto-revert path additionally restores aborted/failed
    // runs that stopped after writes had already landed.
    const revertable =
      run.status === 'committed' ||
      (command.opts?.allowAbortedOrFailed === true &&
        (run.status === 'aborted' || run.status === 'failed'));
    if (!revertable) {
      return {
        reverted: false,
        reason: `Only a committed run can be reverted (this run is ${run.status}).`,
      };
    }

    if (run.scenario === 'new_week') {
      return {
        reverted: false,
        reason:
          'Full week generations cannot be auto-reverted yet — there is no safe way to ' +
          'undo committing a whole week of sessions. Edit the affected sessions directly instead.',
      };
    }

    const before = run.beforeSnapshot as AutoModeBeforeSnapshot;

    try {
      if (run.scenario === 'weekly_targets_edit') {
        await this.revertWeeklyTargets(userId, run.programId, run.weekIndex, before);
      } else {
        await this.revertSingleSession(userId, run.scenario, before);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        return { reverted: false, reason: err.message };
      }
      throw err;
    }

    if (run.status === 'committed') {
      // User-requested undo of a committed run: flip its status and record
      // that its writes have been rolled back.
      await this.runs.markAborted(run.id, 'Reverted by user.');
      await this.runs.markWriteAudit(run.id, { writesPerformed: true, reverted: true });
    }
    // Auto-revert path: the orchestrator stamps the write audit itself so the
    // run keeps its real abort/failure reason.
    return { reverted: true };
  }

  private async revertWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    before: AutoModeBeforeSnapshot,
  ): Promise<void> {
    const targets = before.week.weeklyTargets;
    if (!targets) {
      throw ApiError.badRequest('No prior weekly targets recorded for this run.', {
        programId,
        weekIndex,
      });
    }

    await this.commandBus.execute(
      new ReviseWeeklyTargetsCommand(
        userId,
        programId,
        weekIndex,
        targets.sessionCount,
        targets.totalVolume,
        targets.keyGoals,
        `Reverting auto-mode run for week ${weekIndex}.`,
        'auto_mode_revert',
      ),
    );

    for (const session of before.sessions) {
      if (session.planState !== 'committed' || !session.id) {
        continue;
      }
      await this.restoreContent(userId, session);
    }
  }

  private async revertSingleSession(
    userId: string,
    scenario: 'session_edit' | 'session_time_edit',
    before: AutoModeBeforeSnapshot,
  ): Promise<void> {
    const session = before.sessions[0];
    if (!session?.id) {
      throw ApiError.badRequest('No prior session state recorded for this run.', {});
    }

    if (scenario === 'session_edit') {
      await this.restoreContent(userId, session);
    } else {
      await this.commandBus.execute(
        new UpsertSessionScheduleCommand(userId, session.id, {
          scheduledDate: session.scheduledDate,
          startTime: session.startTime,
          endTime: session.endTime,
          timezone: session.timezone,
          scheduledStartUtc: session.scheduledStartUtc,
        }),
      );
      await this.resyncIfCommitted(userId, session.id);
    }
  }

  private async restoreContent(userId: string, session: PlannedSession): Promise<void> {
    if (!session.id) {
      return;
    }
    await this.commandBus.execute(
      new UpsertSessionContentCommand(
        userId,
        session.id,
        {
          title: session.title,
          estDurationMin: session.estDurationMin,
          intensityLabel: session.intensityLabel,
          coachNotes: session.coachNotes,
          running: session.running,
          strength: session.strength,
        },
        {
          committedAt: new Date().toISOString(),
          changes: [{ field: 'revert', before: 'auto-mode edit', after: 'reverted' }],
        },
      ),
    );
    await this.resyncIfCommitted(userId, session.id);
  }

  private async resyncIfCommitted(userId: string, plannedSessionId: string): Promise<void> {
    const session = await this.plannedSessions.findById(userId, plannedSessionId);
    if (!session || session.planState !== 'committed' || !session.id) {
      return;
    }
    await this.calendarSync.syncWeek(userId, [
      {
        id: session.id,
        title: session.title,
        coachNotes: session.coachNotes,
        scheduledStartUtc: session.scheduledStartUtc,
        estDurationMin: session.estDurationMin,
        timezone: session.timezone,
        calendarSync: session.calendarSync,
      },
    ]);
  }
}
