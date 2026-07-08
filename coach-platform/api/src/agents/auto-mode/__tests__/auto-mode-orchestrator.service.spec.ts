import {
  AutoModeOrchestratorService,
  RunAutoModeInput,
} from '../auto-mode-orchestrator.service';
import { AppendMessageCommand } from '../../conversation/application/commands/append-message.command';
import { StartConversationCommand } from '../../conversation/application/commands/start-conversation.command';
import { RevertAutoModeRunCommand } from '../application/commands/revert-auto-mode-run.command';
import { AutoModeGraphState } from '../auto-mode.state';
import { AutoModeRun } from '../domain/auto-mode-run.model';
import { Program, ProgramWeek } from '../../../program/domain/program.model';
import { PlannedSession } from '../../../planned-sessions/domain/planned-session.model';

function week(overrides: Partial<ProgramWeek> = {}): ProgramWeek {
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
    weeklyTargets: null,
    ...overrides,
  };
}

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: 'p1',
    userId: 'u1',
    trainingProfileId: null,
    discipline: 'running',
    goalSnapshot: { primaryGoal: 'race', note: null, horizon: '2026-10-01' },
    startDate: '2026-06-01',
    horizonDate: '2026-10-01',
    status: 'active',
    currentWeekIndex: 2,
    weeks: [week()],
    ...overrides,
  };
}

function autoModeRun(overrides: Partial<AutoModeRun> = {}): AutoModeRun {
  return {
    id: 'run-1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    scenario: 'new_week',
    trigger: 'manual_trigger',
    conversationId: 'conv-1',
    status: 'committed',
    trace: [],
    beforeSnapshot: null,
    diff: {},
    failureReason: null,
    writesPerformed: false,
    reverted: false,
    createdAt: '2026-07-08T09:00:00.000Z',
    startedAt: '2026-07-08T09:00:00.000Z',
    completedAt: '2026-07-08T09:05:00.000Z',
    ...overrides,
  };
}

function graphState(overrides: Partial<AutoModeGraphState> = {}): AutoModeGraphState {
  return {
    runId: 'run-1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    discipline: 'running',
    timezone: 'UTC',
    scenario: 'new_week',
    trigger: 'manual_trigger',
    conversationId: 'conv-1',
    weekWindow: { from: '2026-07-06', to: '2026-07-12' },
    weeklyTargetsEditRequest: null,
    sessionEditRequest: null,
    sessionTimeEditRequest: null,
    writesPerformed: false,
    recoveryVerdict: null,
    readinessBand: null,
    debateRound: 0,
    guardrailViolations: [],
    trace: [],
    sessionChanges: [],
    diff: {},
    status: 'running',
    abortReason: null,
    ...overrides,
  } as AutoModeGraphState;
}

function setup() {
  const graph = { run: jest.fn() };
  const lock = { acquire: jest.fn(() => Promise.resolve(true)), release: jest.fn(() => Promise.resolve()) };
  const explanation = { build: jest.fn(() => 'explained') };
  const loop = { run: jest.fn() };
  const commandBus = {
    execute: jest.fn((command: unknown) => {
      if (command instanceof StartConversationCommand) {
        return Promise.resolve({ conversationId: 'conv-new' });
      }
      if (command instanceof AppendMessageCommand) {
        return Promise.resolve({ message: { id: 'msg-1' } });
      }
      if (command instanceof RevertAutoModeRunCommand) {
        return Promise.resolve({ reverted: true });
      }
      return Promise.resolve(undefined);
    }),
  };
  const runs = {
    create: jest.fn(() => Promise.resolve(autoModeRun())),
    findByIdScoped: jest.fn(() => Promise.resolve(autoModeRun())),
    appendTrace: jest.fn(() => Promise.resolve()),
    markStarted: jest.fn(() => Promise.resolve()),
    markCommitted: jest.fn(() => Promise.resolve()),
    markAborted: jest.fn(() => Promise.resolve()),
    markFailed: jest.fn(() => Promise.resolve()),
    markWriteAudit: jest.fn(() => Promise.resolve()),
    findRecent: jest.fn(() => Promise.resolve([])),
    findStaleRunning: jest.fn(() => Promise.resolve([])),
  };
  const programs = {
    findById: jest.fn(() => Promise.resolve<Program | null>(program())),
    findActive: jest.fn(),
    replaceActive: jest.fn(),
    updateWeeks: jest.fn(),
    proposeWeeklyTargets: jest.fn(),
    lockWeeklyTargets: jest.fn(),
    reviseWeeklyTargets: jest.fn(),
    setWeekRunLock: jest.fn(),
  };
  const plannedSessions = {
    findByWeek: jest.fn(() => Promise.resolve<PlannedSession[]>([])),
    findByDateRange: jest.fn(),
    findPastDuePlanned: jest.fn(),
    findMatchCandidates: jest.fn(),
    findById: jest.fn(),
    commitSession: jest.fn(),
    updateOutcome: jest.fn(),
    commitWeek: jest.fn(),
    discardTentativeWeek: jest.fn(),
    updateSchedule: jest.fn(),
    updateContent: jest.fn(),
    updateCalendarSync: jest.fn(),
  };
  const conversationContext = {
    buildHistory: jest.fn(() => Promise.resolve([])),
  };
  const readTools = {
    all: jest.fn(() => []),
  };
  const preferenceIngestion = {
    ingest: jest.fn(() => Promise.resolve({ batchId: null, eventIds: [], constraintIds: [] })),
  };

  const orchestrator = new AutoModeOrchestratorService(
    graph as never,
    lock as never,
    explanation as never,
    loop as never,
    commandBus as never,
    conversationContext as never,
    readTools as never,
    preferenceIngestion as never,
    runs as never,
    programs as never,
    plannedSessions as never,
  );

  return {
    orchestrator,
    graph,
    lock,
    explanation,
    loop,
    commandBus,
    runs,
    programs,
    plannedSessions,
    conversationContext,
    readTools,
    preferenceIngestion,
  };
}

function baseInput(overrides: Partial<RunAutoModeInput> = {}): RunAutoModeInput {
  return {
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    timezone: 'UTC',
    scenario: 'new_week',
    trigger: 'manual_trigger',
    conversationId: 'conv-1',
    ...overrides,
  };
}

describe('AutoModeOrchestratorService', () => {
  describe('runAutoMode', () => {
    it('throws when the program does not exist', async () => {
      const { orchestrator, programs } = setup();
      programs.findById.mockResolvedValueOnce(null);

      await expect(orchestrator.runAutoMode(baseInput())).rejects.toThrow(/No program/);
    });

    it('throws when the program has no matching week', async () => {
      const { orchestrator, programs } = setup();
      programs.findById.mockResolvedValueOnce(program({ weeks: [week({ weekIndex: 9 })] }));

      await expect(orchestrator.runAutoMode(baseInput())).rejects.toThrow(/no week 2/);
    });

    it('happy committed path: commits the run, releases the lock, and finalizes via explanation + reply', async () => {
      const { orchestrator, graph, lock, explanation, commandBus, runs } = setup();
      const trace = [
        { node: 'coach', at: '2026-07-08T09:00:00.000Z', summary: 'step one' },
        { node: 'commit', at: '2026-07-08T09:01:00.000Z', summary: 'step two' },
      ];
      const diff = { sessions: [{ sessionId: 's1', before: null, after: { title: 'Long run' } }] };
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace, diff }));

      const outcome = await orchestrator.runAutoMode(baseInput());

      expect(lock.acquire).toHaveBeenCalledWith('u1', 'p1', 2, 'run-1');
      expect(runs.appendTrace).toHaveBeenCalledTimes(2);
      expect(runs.appendTrace).toHaveBeenNthCalledWith(1, 'run-1', { node: 'coach', summary: 'step one' });
      expect(runs.appendTrace).toHaveBeenNthCalledWith(2, 'run-1', { node: 'commit', summary: 'step two' });
      expect(runs.markCommitted).toHaveBeenCalledWith('run-1', diff);
      expect(runs.markAborted).not.toHaveBeenCalled();
      expect(runs.markFailed).not.toHaveBeenCalled();
      expect(lock.release).toHaveBeenCalledWith('u1', 'p1', 2, 'run-1');

      expect(explanation.build).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-1' }));
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'explained',
        }),
      );
      expect(outcome).toEqual({
        run: expect.objectContaining({ id: 'run-1' }),
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        reply: 'explained',
      });
    });

    it('releases the lock in a finally block even on the happy path', async () => {
      const { orchestrator, graph, lock } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));

      await orchestrator.runAutoMode(baseInput());

      expect(lock.release).toHaveBeenCalledTimes(1);
    });

    it('happy aborted path: marks the run aborted instead of committed', async () => {
      const { orchestrator, graph, runs, commandBus } = setup();
      graph.run.mockResolvedValueOnce(
        graphState({ status: 'aborted', abortReason: 'guardrail breach', trace: [] }),
      );

      await orchestrator.runAutoMode(baseInput());

      expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'guardrail breach');
      expect(runs.markCommitted).not.toHaveBeenCalled();
      // A clean abort (no writes) needs no revert and no write audit.
      expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(RevertAutoModeRunCommand));
      expect(runs.markWriteAudit).not.toHaveBeenCalled();
    });

    it('aborted after writes landed: auto-reverts via the revert command and records the audit + trace', async () => {
      const { orchestrator, graph, runs, commandBus } = setup();
      graph.run.mockResolvedValueOnce(
        graphState({
          status: 'aborted',
          abortReason: 'cascade breached targets',
          writesPerformed: true,
          trace: [],
        }),
      );

      await orchestrator.runAutoMode(baseInput());

      expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'cascade breached targets');
      expect(commandBus.execute).toHaveBeenCalledWith(
        new RevertAutoModeRunCommand('u1', 'run-1', { allowAbortedOrFailed: true }),
      );
      expect(runs.markWriteAudit).toHaveBeenCalledWith('run-1', {
        writesPerformed: true,
        reverted: true,
      });
      expect(runs.appendTrace).toHaveBeenCalledWith('run-1', {
        node: 'revert',
        summary: 'revert: restored the week to its pre-run state',
      });
    });

    it('records a failed auto-revert honestly (reverted false + failure trace), without throwing', async () => {
      const { orchestrator, graph, runs, commandBus } = setup();
      graph.run.mockResolvedValueOnce(
        graphState({ status: 'aborted', abortReason: 'stopped', writesPerformed: true, trace: [] }),
      );
      commandBus.execute.mockImplementation((command: unknown) => {
        if (command instanceof RevertAutoModeRunCommand) {
          return Promise.resolve({ reverted: false, reason: 'no snapshot' });
        }
        if (command instanceof AppendMessageCommand) {
          return Promise.resolve({ message: { id: 'msg-1' } });
        }
        return Promise.resolve(undefined);
      });

      const outcome = await orchestrator.runAutoMode(baseInput());

      expect(runs.markWriteAudit).toHaveBeenCalledWith('run-1', {
        writesPerformed: true,
        reverted: false,
      });
      expect(runs.appendTrace).toHaveBeenCalledWith('run-1', {
        node: 'revert',
        summary: expect.stringContaining('could not restore the pre-run state (no snapshot)'),
      });
      expect(outcome.reply).toBe('explained');
    });

    it('when the lock is not acquired, marks the run failed, never calls graph.run, and still finalizes', async () => {
      const { orchestrator, graph, lock, runs, explanation } = setup();
      lock.acquire.mockResolvedValueOnce(false);

      const outcome = await orchestrator.runAutoMode(baseInput());

      expect(runs.markFailed).toHaveBeenCalledWith(
        'run-1',
        expect.stringContaining('Week 2 is already locked'),
      );
      expect(graph.run).not.toHaveBeenCalled();
      expect(explanation.build).toHaveBeenCalled();
      expect(outcome.reply).toBe('explained');
    });

    it('when graph.run throws, marks the run failed with the error message, still releases the lock, and finalizes', async () => {
      const { orchestrator, graph, lock, runs } = setup();
      graph.run.mockRejectedValueOnce(new Error('boom'));

      await orchestrator.runAutoMode(baseInput());

      expect(runs.markFailed).toHaveBeenCalledWith('run-1', 'boom');
      expect(lock.release).toHaveBeenCalledWith('u1', 'p1', 2, 'run-1');
    });

    it('when graph.run throws, attempts an auto-revert (writes unknown) and records the audit', async () => {
      const { orchestrator, graph, runs, commandBus } = setup();
      graph.run.mockRejectedValueOnce(new Error('boom'));

      await orchestrator.runAutoMode(baseInput());

      expect(commandBus.execute).toHaveBeenCalledWith(
        new RevertAutoModeRunCommand('u1', 'run-1', { allowAbortedOrFailed: true }),
      );
      expect(runs.markWriteAudit).toHaveBeenCalledWith('run-1', {
        writesPerformed: true,
        reverted: true,
      });
    });

    it('reuses the given conversationId and never opens a new one', async () => {
      const { orchestrator, graph, commandBus } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));

      await orchestrator.runAutoMode(baseInput({ conversationId: 'conv-1' }));

      expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(StartConversationCommand));
    });

    it('opens a fresh auto conversation when none is given, and uses its id for the run + reply', async () => {
      const { orchestrator, graph, commandBus, runs } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));

      const outcome = await orchestrator.runAutoMode(baseInput({ conversationId: undefined }));

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          opts: expect.objectContaining({ mode: 'auto' }),
        }),
      );
      expect(runs.create).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-new' }),
      );
      expect(outcome.conversationId).toBe('conv-new');
    });
  });

  describe('handleChatMessage', () => {
    it('when the loop yields no terminal result, posts a plain reply and never starts a run', async () => {
      const { orchestrator, loop, commandBus, runs } = setup();
      loop.run.mockResolvedValueOnce({ terminalResult: null });

      const result = await orchestrator.handleChatMessage('u1', 'conv-1', 'huh?', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(runs.create).not.toHaveBeenCalled();
      expect(result.reply).toMatch(/couldn't tell which change/);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', role: 'assistant', content: result.reply }),
      );
      expect(result.assistantMessageId).toBe('msg-1');
    });

    it('routes a weekly_targets_edit intent into runAutoMode with the built edit request', async () => {
      const { orchestrator, graph, loop } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'weekly_targets_edit',
          sessionCount: 5,
          totalVolume: 45,
          keyGoals: ['tempo'],
          reason: 'feeling strong',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      await orchestrator.handleChatMessage('u1', 'conv-1', 'bump my volume', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: 'weekly_targets_edit',
          trigger: 'chat',
          conversationId: 'conv-1',
          weeklyTargetsEditRequest: {
            sessionCount: 5,
            totalVolume: 45,
            keyGoals: ['tempo'],
            reason: 'feeling strong',
          },
          sessionEditRequest: null,
          sessionTimeEditRequest: null,
        }),
      );
    });

    it('routes a session_edit intent with a plannedSessionId into a sessionEditRequest', async () => {
      const { orchestrator, graph, loop } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'session_edit',
          plannedSessionId: 'sess-1',
          requestedChangeDescription: 'make it shorter',
          reason: 'tired',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      await orchestrator.handleChatMessage('u1', 'conv-1', 'shorten my run', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: 'session_edit',
          sessionEditRequest: { plannedSessionId: 'sess-1', requestedChangeDescription: 'make it shorter' },
          weeklyTargetsEditRequest: null,
          sessionTimeEditRequest: null,
        }),
      );
    });

    it('asks which session is meant (and never runs) when session_edit finalizes without a plannedSessionId', async () => {
      const { orchestrator, graph, loop, runs, commandBus } = setup();
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'session_edit',
          plannedSessionId: null,
          requestedChangeDescription: 'make it shorter',
          reason: 'tired',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      const result = await orchestrator.handleChatMessage('u1', 'conv-1', 'shorten my run', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(spy).not.toHaveBeenCalled();
      expect(graph.run).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
      expect(result.reply).toMatch(/which one did you mean/i);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', role: 'assistant', content: result.reply }),
      );
      expect(result.assistantMessageId).toBe('msg-1');
    });

    it('routes a session_time_edit intent with a plannedSessionId into a sessionTimeEditRequest', async () => {
      const { orchestrator, graph, loop } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'session_time_edit',
          plannedSessionId: 'sess-2',
          requestedDate: '2026-07-10',
          requestedStartTime: '07:00',
          reason: 'meeting conflict',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      await orchestrator.handleChatMessage('u1', 'conv-1', 'move my run', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          scenario: 'session_time_edit',
          sessionTimeEditRequest: {
            plannedSessionId: 'sess-2',
            requestedDate: '2026-07-10',
            requestedStartTime: '07:00',
          },
          weeklyTargetsEditRequest: null,
          sessionEditRequest: null,
        }),
      );
    });

    it('asks which session is meant (and never runs) when session_time_edit finalizes without a plannedSessionId', async () => {
      const { orchestrator, graph, loop, runs, commandBus } = setup();
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'session_time_edit',
          plannedSessionId: null,
          requestedDate: '2026-07-10',
          requestedStartTime: '07:00',
          reason: 'meeting conflict',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      const result = await orchestrator.handleChatMessage('u1', 'conv-1', 'move my run', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(spy).not.toHaveBeenCalled();
      expect(graph.run).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
      expect(result.reply).toMatch(/which one did you mean/i);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', role: 'assistant', content: result.reply }),
      );
    });

    it('asks what to change (and never runs) when weekly_targets_edit finalizes with no target fields', async () => {
      const { orchestrator, graph, loop, runs } = setup();
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'weekly_targets_edit',
          sessionCount: null,
          totalVolume: null,
          keyGoals: null,
          reason: 'wants a change',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      const result = await orchestrator.handleChatMessage('u1', 'conv-1', 'change my targets', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(spy).not.toHaveBeenCalled();
      expect(graph.run).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
      expect(result.reply).toMatch(/sessions, the total volume, or the focus/i);
    });

    it('pauses on a clarifyingQuestion: posts it as a plain reply and never starts a run', async () => {
      const { orchestrator, loop, graph, runs, commandBus } = setup();
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: null,
          reason: null,
          clarifyingQuestion: 'Is this just for this week, or going forward?',
          standingPreference: null,
        },
      });

      const result = await orchestrator.handleChatMessage('u1', 'conv-1', 'cut my volume', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(graph.run).not.toHaveBeenCalled();
      expect(runs.create).not.toHaveBeenCalled();
      expect(result.reply).toBe('Is this just for this week, or going forward?');
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'Is this just for this week, or going forward?',
        }),
      );
    });

    it('ingests a confirmed standingPreference through the preference log once the run is dispatched', async () => {
      const { orchestrator, loop, graph, preferenceIngestion } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'weekly_targets_edit',
          sessionCount: 4,
          totalVolume: 30,
          keyGoals: null,
          reason: 'cutting back after a hard block',
          clarifyingQuestion: null,
          standingPreference: {
            tagType: 'volume_too_high',
            value: 30,
            polarity: 'decrease',
            durability: 'standing',
            scope: 'global',
            discipline: 'running',
            affectsCurrentWeek: false,
            rationale: 'Athlete confirmed 30km should be the new standing weekly cap.',
          },
        },
      });

      await orchestrator.handleChatMessage('u1', 'conv-1', 'cap my weekly km at 30 going forward', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(preferenceIngestion.ingest).toHaveBeenCalledWith(
        'u1',
        'chat',
        [
          expect.objectContaining({
            eventDate: '2026-07-08',
            tag: expect.objectContaining({ type: 'volume_too_high', confidence: 'explicit' }),
            rationale: 'Athlete confirmed 30km should be the new standing weekly cap.',
          }),
        ],
        false,
      );
    });

    it('threads conversation history and read-tools into the classification loop', async () => {
      const { orchestrator, loop, graph, conversationContext, readTools } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
      const history = [{ role: 'user' as const, content: 'earlier message' }];
      conversationContext.buildHistory.mockResolvedValueOnce(history as never);
      const readTool = { name: 'get_preference_events' };
      readTools.all.mockReturnValueOnce([readTool as never]);
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'new_week',
          reason: 'start of a new training week',
          clarifyingQuestion: null,
          standingPreference: null,
        },
      });

      await orchestrator.handleChatMessage('u1', 'conv-1', 'build next week', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        today: '2026-07-08',
      });

      expect(conversationContext.buildHistory).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', conversationId: 'conv-1' }),
      );
      expect(loop.run).toHaveBeenCalledWith(
        expect.objectContaining({
          history,
          tools: expect.arrayContaining([readTool]),
        }),
      );
    });
  });
});
