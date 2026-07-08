import { ApiError } from '../../../../../common/errors/api-error';
import { ProgramWeek } from '../../../../../program/domain/program.model';
import { ReviseWeeklyTargetsCommand } from '../../../../../program/application/commands/revise-weekly-targets.command';
import { UpsertSessionContentCommand } from '../../../../../planned-sessions/application/commands/upsert-session-content.command';
import { UpsertSessionScheduleCommand } from '../../../../../planned-sessions/application/commands/upsert-session-schedule.command';
import { PlannedSession } from '../../../../../planned-sessions/domain/planned-session.model';
import { AutoModeRun } from '../../../domain/auto-mode-run.model';
import { RevertAutoModeRunCommand } from '../revert-auto-mode-run.command';
import { RevertAutoModeRunHandler } from '../revert-auto-mode-run.handler';

const NOW = '2026-07-08T12:00:00.000Z';

function week(weeklyTargets: ProgramWeek['weeklyTargets'] = {
  sessionCount: 4,
  totalVolume: 40,
  keyGoals: ['one quality tempo'],
  lockedAt: '2026-06-29T09:00:00.000Z',
}): ProgramWeek {
  return {
    weekIndex: 2,
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    theme: 'build',
    plannedLoadTarget: null,
    planState: 'tentative',
    status: 'current',
    generatedAt: null,
    weekState: 'targets_locked',
    weeklyTargets,
  };
}

function session(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: 's1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    slotKey: 'week2-mon',
    type: 'running',
    scheduledDate: '2026-07-06',
    startTime: '06:00',
    endTime: '06:45',
    timezone: 'America/New_York',
    scheduledStartUtc: '2026-07-06T10:00:00.000Z',
    planState: 'committed',
    title: 'Easy run',
    estDurationMin: 45,
    intensityLabel: 'easy',
    coachNotes: 'Keep it conversational.',
    running: {
      runType: 'easy',
      totalDistanceKm: 8,
      totalDurationMin: 45,
      targetPace: null,
      targetHrZone: null,
      targetRpe: null,
      blocks: [],
    },
    strength: null,
    outcome: {
      status: 'planned',
      reasonCode: null,
      perceivedEffort: null,
      enjoyment: null,
      matchedActivityId: null,
      feedbackRef: null,
      recordedAt: null,
    },
    calendarSync: null,
    ...overrides,
  };
}

function run(overrides: Partial<AutoModeRun> = {}): AutoModeRun {
  return {
    id: 'run-1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    scenario: 'weekly_targets_edit',
    trigger: 'chat',
    conversationId: 'c1',
    status: 'committed',
    trace: [],
    beforeSnapshot: { week: week(), sessions: [] },
    diff: null,
    failureReason: null,
    writesPerformed: false,
    reverted: false,
    createdAt: NOW,
    startedAt: NOW,
    completedAt: NOW,
    ...overrides,
  };
}

function setup() {
  const runs = {
    findByIdScoped: jest.fn<Promise<AutoModeRun | null>, [string, string]>(),
    markAborted: jest.fn(() => Promise.resolve()),
    markWriteAudit: jest.fn(() => Promise.resolve()),
  };
  const plannedSessions = {
    findById: jest.fn<Promise<PlannedSession | null>, [string, string]>(),
  };
  const calendarSync = {
    syncWeek: jest.fn(() => Promise.resolve({ synced: 1, failed: 0 })),
  };
  const commandBus = {
    execute: jest.fn(() => Promise.resolve()),
  };
  const handler = new RevertAutoModeRunHandler(
    runs as never,
    plannedSessions as never,
    calendarSync as never,
    commandBus as never,
  );
  return { handler, runs, plannedSessions, calendarSync, commandBus };
}

describe('RevertAutoModeRunHandler', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date(NOW));
  });
  afterAll(() => jest.useRealTimers());

  it('throws ApiError.notFound when the run does not exist', async () => {
    const { handler, runs } = setup();
    runs.findByIdScoped.mockResolvedValueOnce(null);

    await expect(
      handler.execute(new RevertAutoModeRunCommand('u1', 'run-1')),
    ).rejects.toThrow(ApiError);
    await expect(
      handler.execute(new RevertAutoModeRunCommand('u1', 'run-1')),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each(['running', 'aborted', 'failed'] as const)(
    'returns reverted:false without touching commandBus when run.status is %s',
    async (status) => {
      const { handler, runs, commandBus } = setup();
      runs.findByIdScoped.mockResolvedValueOnce(run({ status }));

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(result.reverted).toBe(false);
      expect(result.reason).toContain(status);
      expect(commandBus.execute).not.toHaveBeenCalled();
    },
  );

  describe('auto-revert of non-committed runs (allowAbortedOrFailed)', () => {
    it.each(['aborted', 'failed'] as const)(
      'reverts a %s run when allowAbortedOrFailed is set, without rewriting its status/reason',
      async (status) => {
        const { handler, runs, commandBus } = setup();
        runs.findByIdScoped.mockResolvedValueOnce(
          run({
            status,
            scenario: 'weekly_targets_edit',
            beforeSnapshot: { week: week(), sessions: [] },
          }),
        );

        const result = await handler.execute(
          new RevertAutoModeRunCommand('u1', 'run-1', { allowAbortedOrFailed: true }),
        );

        expect(result).toEqual({ reverted: true });
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ReviseWeeklyTargetsCommand));
        // The run keeps its original abort/failure reason — the orchestrator
        // stamps the write audit itself on this path.
        expect(runs.markAborted).not.toHaveBeenCalled();
        expect(runs.markWriteAudit).not.toHaveBeenCalled();
      },
    );

    it('still refuses a running run even with allowAbortedOrFailed', async () => {
      const { handler, runs, commandBus } = setup();
      runs.findByIdScoped.mockResolvedValueOnce(run({ status: 'running' }));

      const result = await handler.execute(
        new RevertAutoModeRunCommand('u1', 'run-1', { allowAbortedOrFailed: true }),
      );

      expect(result.reverted).toBe(false);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  it('stamps the write audit (reverted) after a user-requested undo of a committed run', async () => {
    const { handler, runs } = setup();
    runs.findByIdScoped.mockResolvedValueOnce(
      run({
        status: 'committed',
        scenario: 'weekly_targets_edit',
        beforeSnapshot: { week: week(), sessions: [] },
      }),
    );

    const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

    expect(result).toEqual({ reverted: true });
    expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'Reverted by user.');
    expect(runs.markWriteAudit).toHaveBeenCalledWith('run-1', {
      writesPerformed: true,
      reverted: true,
    });
  });

  it('returns reverted:false for a committed "new_week" run and does not call commandBus', async () => {
    const { handler, runs, commandBus } = setup();
    runs.findByIdScoped.mockResolvedValueOnce(
      run({ status: 'committed', scenario: 'new_week' }),
    );

    const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

    expect(result.reverted).toBe(false);
    expect(result.reason).toMatch(/cannot be auto-reverted/);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  describe('weekly_targets_edit', () => {
    it('happy path: revises targets and restores content only for committed sessions, then marks the run aborted', async () => {
      const { handler, runs, commandBus } = setup();
      const committedSession = session({ id: 's1', planState: 'committed', title: 'Restore me' });
      const tentativeSession = session({ id: 's2', planState: 'tentative', title: 'Skip me' });
      const targets = {
        sessionCount: 4,
        totalVolume: 40,
        keyGoals: ['one quality tempo'],
        lockedAt: '2026-06-29T09:00:00.000Z',
      };
      runs.findByIdScoped.mockResolvedValueOnce(
        run({
          scenario: 'weekly_targets_edit',
          beforeSnapshot: { week: week(targets), sessions: [committedSession, tentativeSession] },
        }),
      );

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(commandBus.execute).toHaveBeenCalledWith(
        new ReviseWeeklyTargetsCommand(
          'u1',
          'p1',
          2,
          targets.sessionCount,
          targets.totalVolume,
          targets.keyGoals,
          'Reverting auto-mode run for week 2.',
          'auto_mode_revert',
        ),
      );
      expect(commandBus.execute).toHaveBeenCalledWith(
        new UpsertSessionContentCommand(
          'u1',
          's1',
          {
            title: 'Restore me',
            estDurationMin: committedSession.estDurationMin,
            intensityLabel: committedSession.intensityLabel,
            coachNotes: committedSession.coachNotes,
            running: committedSession.running,
            strength: committedSession.strength,
          },
          {
            committedAt: NOW,
            changes: [{ field: 'revert', before: 'auto-mode edit', after: 'reverted' }],
          },
        ),
      );
      // Only the committed session's content is restored — the tentative one is skipped.
      expect(commandBus.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ plannedSessionId: 's2' }),
      );
      expect(commandBus.execute).toHaveBeenCalledTimes(2); // 1 revise + 1 restore
      expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'Reverted by user.');
      expect(result).toEqual({ reverted: true });
    });

    it('returns reverted:false (does not throw) when beforeSnapshot.week.weeklyTargets is null', async () => {
      const { handler, runs, commandBus } = setup();
      runs.findByIdScoped.mockResolvedValueOnce(
        run({
          scenario: 'weekly_targets_edit',
          beforeSnapshot: { week: week(null), sessions: [] },
        }),
      );

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(result.reverted).toBe(false);
      expect(result.reason).toMatch(/no prior weekly targets/i);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('session_edit', () => {
    it('happy path: restores content for sessions[0] and resyncs only when the session is now committed', async () => {
      const { handler, runs, plannedSessions, calendarSync, commandBus } = setup();
      const priorSession = session({ id: 's1', title: 'Original title' });
      runs.findByIdScoped.mockResolvedValueOnce(
        run({ scenario: 'session_edit', beforeSnapshot: { week: week(), sessions: [priorSession] } }),
      );
      plannedSessions.findById.mockResolvedValueOnce(
        session({ id: 's1', planState: 'committed' }),
      );

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(commandBus.execute).toHaveBeenCalledWith(
        new UpsertSessionContentCommand(
          'u1',
          's1',
          {
            title: 'Original title',
            estDurationMin: priorSession.estDurationMin,
            intensityLabel: priorSession.intensityLabel,
            coachNotes: priorSession.coachNotes,
            running: priorSession.running,
            strength: priorSession.strength,
          },
          {
            committedAt: NOW,
            changes: [{ field: 'revert', before: 'auto-mode edit', after: 'reverted' }],
          },
        ),
      );
      expect(calendarSync.syncWeek).toHaveBeenCalledTimes(1);
      expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'Reverted by user.');
      expect(result).toEqual({ reverted: true });
    });

    it('does not resync when the current planned session is not committed', async () => {
      const { handler, runs, plannedSessions, calendarSync } = setup();
      const priorSession = session({ id: 's1' });
      runs.findByIdScoped.mockResolvedValueOnce(
        run({ scenario: 'session_edit', beforeSnapshot: { week: week(), sessions: [priorSession] } }),
      );
      plannedSessions.findById.mockResolvedValueOnce(
        session({ id: 's1', planState: 'tentative' }),
      );

      await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(calendarSync.syncWeek).not.toHaveBeenCalled();
    });

    it('does not resync when the current planned session is not found', async () => {
      const { handler, runs, plannedSessions, calendarSync } = setup();
      const priorSession = session({ id: 's1' });
      runs.findByIdScoped.mockResolvedValueOnce(
        run({ scenario: 'session_edit', beforeSnapshot: { week: week(), sessions: [priorSession] } }),
      );
      plannedSessions.findById.mockResolvedValueOnce(null);

      await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(calendarSync.syncWeek).not.toHaveBeenCalled();
    });

    it('returns reverted:false when beforeSnapshot.sessions is empty', async () => {
      const { handler, runs, commandBus } = setup();
      runs.findByIdScoped.mockResolvedValueOnce(
        run({ scenario: 'session_edit', beforeSnapshot: { week: week(), sessions: [] } }),
      );

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(result.reverted).toBe(false);
      expect(result.reason).toMatch(/no prior session state/i);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('session_time_edit', () => {
    it('happy path: restores schedule via UpsertSessionScheduleCommand, then resyncs only when committed', async () => {
      const { handler, runs, plannedSessions, calendarSync, commandBus } = setup();
      const priorSession = session({
        id: 's1',
        scheduledDate: '2026-07-05',
        startTime: '05:30',
        endTime: '06:15',
        timezone: 'America/New_York',
        scheduledStartUtc: '2026-07-05T09:30:00.000Z',
      });
      runs.findByIdScoped.mockResolvedValueOnce(
        run({
          scenario: 'session_time_edit',
          beforeSnapshot: { week: week(), sessions: [priorSession] },
        }),
      );
      plannedSessions.findById.mockResolvedValueOnce(
        session({ id: 's1', planState: 'committed' }),
      );

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(commandBus.execute).toHaveBeenCalledWith(
        new UpsertSessionScheduleCommand('u1', 's1', {
          scheduledDate: '2026-07-05',
          startTime: '05:30',
          endTime: '06:15',
          timezone: 'America/New_York',
          scheduledStartUtc: '2026-07-05T09:30:00.000Z',
        }),
      );
      expect(calendarSync.syncWeek).toHaveBeenCalledTimes(1);
      expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'Reverted by user.');
      expect(result).toEqual({ reverted: true });
    });

    it('does not resync when the current planned session is not committed', async () => {
      const { handler, runs, plannedSessions, calendarSync } = setup();
      const priorSession = session({ id: 's1' });
      runs.findByIdScoped.mockResolvedValueOnce(
        run({
          scenario: 'session_time_edit',
          beforeSnapshot: { week: week(), sessions: [priorSession] },
        }),
      );
      plannedSessions.findById.mockResolvedValueOnce(
        session({ id: 's1', planState: 'tentative' }),
      );

      await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(calendarSync.syncWeek).not.toHaveBeenCalled();
    });

    it('returns reverted:false when beforeSnapshot.sessions is empty', async () => {
      const { handler, runs, commandBus } = setup();
      runs.findByIdScoped.mockResolvedValueOnce(
        run({ scenario: 'session_time_edit', beforeSnapshot: { week: week(), sessions: [] } }),
      );

      const result = await handler.execute(new RevertAutoModeRunCommand('u1', 'run-1'));

      expect(result.reverted).toBe(false);
      expect(result.reason).toMatch(/no prior session state/i);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  it('propagates a non-ApiError thrown from inside the try block (never swallowed)', async () => {
    const { handler, runs, commandBus } = setup();
    runs.findByIdScoped.mockResolvedValueOnce(
      run({
        scenario: 'weekly_targets_edit',
        beforeSnapshot: { week: week(), sessions: [] },
      }),
    );
    commandBus.execute.mockRejectedValueOnce(new Error('boom'));

    await expect(
      handler.execute(new RevertAutoModeRunCommand('u1', 'run-1')),
    ).rejects.toThrow('boom');
  });
});
