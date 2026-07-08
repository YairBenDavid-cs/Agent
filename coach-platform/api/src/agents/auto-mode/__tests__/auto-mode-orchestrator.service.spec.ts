import {
  AutoModeOrchestratorService,
  RunAutoModeInput,
} from '../auto-mode-orchestrator.service';
import { AppendMessageCommand } from '../../conversation/application/commands/append-message.command';
import { StartConversationCommand } from '../../conversation/application/commands/start-conversation.command';
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

  const orchestrator = new AutoModeOrchestratorService(
    graph as never,
    lock as never,
    explanation as never,
    loop as never,
    commandBus as never,
    runs as never,
    programs as never,
    plannedSessions as never,
  );

  return { orchestrator, graph, lock, explanation, loop, commandBus, runs, programs, plannedSessions };
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
      const { orchestrator, graph, runs } = setup();
      graph.run.mockResolvedValueOnce(
        graphState({ status: 'aborted', abortReason: 'guardrail breach', trace: [] }),
      );

      await orchestrator.runAutoMode(baseInput());

      expect(runs.markAborted).toHaveBeenCalledWith('run-1', 'guardrail breach');
      expect(runs.markCommitted).not.toHaveBeenCalled();
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

    it('defaults sessionEditRequest to null for session_edit when no plannedSessionId is classified', async () => {
      const { orchestrator, graph, loop } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
      loop.run.mockResolvedValueOnce({
        terminalResult: {
          scenario: 'session_edit',
          plannedSessionId: null,
          requestedChangeDescription: 'make it shorter',
          reason: 'tired',
        },
      });
      const spy = jest.spyOn(orchestrator, 'runAutoMode');

      await orchestrator.handleChatMessage('u1', 'conv-1', 'shorten my run', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
      });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sessionEditRequest: null }));
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

    it('defaults sessionTimeEditRequest to null for session_time_edit when no plannedSessionId is classified', async () => {
      const { orchestrator, graph, loop } = setup();
      graph.run.mockResolvedValueOnce(graphState({ status: 'committed', trace: [], diff: {} }));
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

      await orchestrator.handleChatMessage('u1', 'conv-1', 'move my run', {
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
      });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sessionTimeEditRequest: null }));
    });
  });
});
