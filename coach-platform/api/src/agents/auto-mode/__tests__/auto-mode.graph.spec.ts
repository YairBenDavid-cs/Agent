import { AutoModeGraph } from '../auto-mode.graph';
import { AutoModeGraphState } from '../auto-mode.state';
import { AgenticLoopResult } from '../../shared/llm/agentic-loop.runtime';
import { RecoveryVerdict } from '../../recovery/recovery.contracts';
import { Program, ProgramWeek } from '../../../program/domain/program.model';
import { PlannedSession } from '../../../planned-sessions/domain/planned-session.model';

const USER_ID = 'u1';
const PROGRAM_ID = 'p1';
const WEEK_INDEX = 2;
const RUN_ID = 'run-1';

function loopResult<T>(terminalResult: T | null): AgenticLoopResult<T> {
  return {
    terminalResult,
    terminalTool: terminalResult ? 'tool' : null,
    finalText: null,
    iterations: 1,
    exhausted: terminalResult === null,
  };
}

function verdict(readiness: 'green' | 'amber' | 'red', rationale = 'because'): RecoveryVerdict {
  return {
    readiness,
    drivers: [],
    recommendation: 'proceed',
    params: { volumePct: null, intensityCap: null, durationCapMin: null, activeType: null },
    rationale,
  };
}

function plannedSession(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: 's1',
    userId: USER_ID,
    programId: PROGRAM_ID,
    weekIndex: WEEK_INDEX,
    slotKey: 'w2-mon-run',
    type: 'running',
    scheduledDate: '2026-07-06',
    startTime: '07:00',
    endTime: '08:00',
    timezone: 'UTC',
    scheduledStartUtc: '2026-07-06T07:00:00.000Z',
    planState: 'tentative',
    title: 'Long run',
    estDurationMin: 60,
    intensityLabel: 'moderate',
    coachNotes: null,
    running: {
      runType: 'easy',
      totalDistanceKm: 10,
      totalDurationMin: 60,
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

function priorWeekSessions(): PlannedSession[] {
  return [
    plannedSession({ id: 'prior-1' }),
    plannedSession({ id: 'prior-2' }),
    plannedSession({ id: 'prior-3' }),
  ];
}

function currentWeekSessions(): PlannedSession[] {
  return [
    plannedSession({ id: 'cur-1' }),
    plannedSession({ id: 'cur-2' }),
    plannedSession({ id: 'cur-3' }),
  ];
}

function week(overrides: Partial<ProgramWeek> = {}): ProgramWeek {
  return {
    weekIndex: WEEK_INDEX,
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    theme: 'build',
    plannedLoadTarget: null,
    planState: 'tentative',
    status: 'current',
    generatedAt: null,
    weekState: 'targets_locked',
    weeklyTargets: {
      sessionCount: 4,
      totalVolume: 40,
      keyGoals: ['tempo'],
      lockedAt: '2026-06-29T09:00:00.000Z',
    },
    ...overrides,
  };
}

function programFixture(overrides: Partial<Program> = {}, weekOverrides: Partial<ProgramWeek> = {}): Program {
  return {
    id: PROGRAM_ID,
    userId: USER_ID,
    trainingProfileId: null,
    discipline: 'running',
    goalSnapshot: { primaryGoal: 'race', note: null, horizon: '2026-10-01' },
    startDate: '2026-06-01',
    horizonDate: '2026-10-01',
    status: 'active',
    currentWeekIndex: WEEK_INDEX,
    weeks: [week(weekOverrides)],
    ...overrides,
  };
}

function initialState(overrides: Partial<AutoModeGraphState> = {}): AutoModeGraphState {
  return {
    runId: RUN_ID,
    userId: USER_ID,
    programId: PROGRAM_ID,
    weekIndex: WEEK_INDEX,
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

/**
 * Fully-wired happy-path mocks for every dependency the graph touches across
 * all 4 scenarios. Individual tests override only what that path needs to
 * exercise a different branch.
 */
function setup() {
  const coach = {
    generateWeeklyTargets: jest.fn(() => Promise.resolve(loopResult({ programId: PROGRAM_ID } as never))),
    generateWeek: jest.fn(() => Promise.resolve(loopResult({} as never))),
    reviseWeeklyTargets: jest.fn(() => Promise.resolve({} as never)),
    reviseSessionContent: jest.fn(() => Promise.resolve(loopResult({} as never))),
  };
  const recovery = {
    assessReadiness: jest.fn(() => Promise.resolve(loopResult(verdict('green')))),
  };
  const planner = {
    placeWeek: jest.fn(() => Promise.resolve(loopResult({ placedCount: 3, unplaceable: [] } as never))),
    validateSlot: jest.fn(() => Promise.resolve<string[]>([])),
    proposeSlotsForSession: jest.fn(() => Promise.resolve<never[]>([])),
  };
  const approval = {
    approveWeek: jest.fn(() => Promise.resolve({ committed: 3, calendar: { synced: 3, failed: 0 } })),
  };
  const calendarSync = {
    syncWeek: jest.fn(() => Promise.resolve({ synced: 0, failed: 0 })),
  };
  const commandBus = {
    execute: jest.fn(() => Promise.resolve({ scheduled: true })),
  };
  const programs = {
    findById: jest.fn(() => Promise.resolve<Program | null>(programFixture())),
  };
  const plannedSessions = {
    findByWeek: jest.fn((_userId: string, _programId: string, wi: number) =>
      Promise.resolve(wi === WEEK_INDEX - 1 ? priorWeekSessions() : currentWeekSessions()),
    ),
    findById: jest.fn(() => Promise.resolve<PlannedSession | null>(plannedSession())),
  };

  const graph = new AutoModeGraph(
    coach as never,
    recovery as never,
    planner as never,
    approval as never,
    calendarSync as never,
    commandBus as never,
    programs as never,
    plannedSessions as never,
  );

  return { graph, coach, recovery, planner, approval, calendarSync, commandBus, programs, plannedSessions };
}

describe('AutoModeGraph', () => {
  describe('new_week', () => {
    it('happy path: commits with a populated sessions diff and the full node trace', async () => {
      const { graph, coach, recovery, planner, approval } = setup();

      const finalState = await graph.run(initialState({ scenario: 'new_week' }));

      expect(finalState.status).toBe('committed');
      expect(finalState.diff.sessions).toBeDefined();
      expect(finalState.diff.sessions).toHaveLength(3);
      expect(coach.generateWeek).toHaveBeenCalledTimes(1);
      expect(recovery.assessReadiness).toHaveBeenCalledTimes(2);
      expect(planner.placeWeek).toHaveBeenCalledTimes(1);
      expect(approval.approveWeek).toHaveBeenCalledTimes(1);
      expect(finalState.trace.map((t) => t.node)).toEqual([
        'coach',
        'recovery',
        'coach',
        'recovery',
        'guardrail',
        'planner',
        'commit',
      ]);
    });

    it('routes straight to abort when generateWeeklyTargets never resolves, and never plans/approves', async () => {
      const { graph, coach, planner, approval } = setup();
      coach.generateWeeklyTargets.mockResolvedValueOnce(loopResult(null) as never);

      const finalState = await graph.run(initialState({ scenario: 'new_week' }));

      expect(finalState.status).toBe('aborted');
      expect(finalState.abortReason).toMatch(/iteration cap/i);
      expect(planner.placeWeek).not.toHaveBeenCalled();
      expect(approval.approveWeek).not.toHaveBeenCalled();
    });

    it('debate round 2: regenerates the week conservatively when readiness disagrees (worse) with round 1', async () => {
      const { graph, coach, recovery } = setup();
      recovery.assessReadiness
        .mockResolvedValueOnce(loopResult(verdict('green')))
        .mockResolvedValueOnce(loopResult(verdict('red')));

      const finalState = await graph.run(initialState({ scenario: 'new_week' }));

      expect(coach.generateWeek).toHaveBeenCalledTimes(2);
      expect(finalState.readinessBand).toBe('red');
      expect(finalState.trace.some((t) => t.summary.toLowerCase().includes('conservative'))).toBe(true);
    });
  });

  describe('weekly_targets_edit', () => {
    it('happy path: commits a direct target change within the swing caps', async () => {
      const { graph, coach } = setup();

      const finalState = await graph.run(
        initialState({
          scenario: 'weekly_targets_edit',
          weeklyTargetsEditRequest: { sessionCount: 5, totalVolume: 44, reason: 'more volume' },
        }),
      );

      expect(finalState.status).toBe('committed');
      expect(coach.reviseWeeklyTargets).toHaveBeenCalledWith(
        USER_ID,
        PROGRAM_ID,
        WEEK_INDEX,
        { sessionCount: 5, totalVolume: 44, keyGoals: ['tempo'] },
        'direct_target_change',
        'more volume',
      );
    });

    it('aborts with a plain-language message before debating/committing when the week is still open', async () => {
      const { graph, coach, programs } = setup();
      programs.findById.mockResolvedValue(Promise.resolve(programFixture({}, { weekState: 'open' })));

      const finalState = await graph.run(
        initialState({
          scenario: 'weekly_targets_edit',
          weeklyTargetsEditRequest: { sessionCount: 5, totalVolume: 44, reason: 'more volume' },
        }),
      );

      expect(finalState.status).toBe('aborted');
      expect(finalState.abortReason).toMatch(/haven't been locked in yet/i);
      // Internal state names stay out of the user-facing reason; the trace keeps them.
      expect(finalState.abortReason).not.toMatch(/targets_locked/);
      expect(finalState.trace.some((t) => t.summary.includes("'open'"))).toBe(true);
      expect(coach.reviseWeeklyTargets).not.toHaveBeenCalled();
    });

    it('proceeds on a fully locked week — reviseWeeklyTargets works on locked weeks too', async () => {
      const { graph, coach, programs } = setup();
      programs.findById.mockResolvedValue(Promise.resolve(programFixture({}, { weekState: 'locked' })));

      const finalState = await graph.run(
        initialState({
          scenario: 'weekly_targets_edit',
          weeklyTargetsEditRequest: { sessionCount: 5, totalVolume: 44, reason: 'more volume' },
        }),
      );

      expect(finalState.status).toBe('committed');
      expect(coach.reviseWeeklyTargets).toHaveBeenCalled();
    });

    it('marks writesPerformed once targets have been revised', async () => {
      const { graph } = setup();

      const finalState = await graph.run(
        initialState({
          scenario: 'weekly_targets_edit',
          weeklyTargetsEditRequest: { sessionCount: 5, totalVolume: 44, reason: 'more volume' },
        }),
      );

      expect(finalState.writesPerformed).toBe(true);
    });

    it('aborts with a readable reason (no throw) when the request object is null', async () => {
      const { graph, coach } = setup();

      const finalState = await graph.run(
        initialState({ scenario: 'weekly_targets_edit', weeklyTargetsEditRequest: null }),
      );

      expect(finalState.status).toBe('aborted');
      expect(finalState.abortReason).toMatch(/stopped rather than guess/i);
      expect(finalState.writesPerformed).toBe(false);
      expect(coach.reviseWeeklyTargets).not.toHaveBeenCalled();
    });
  });

  describe('session_edit', () => {
    it('happy path: commits on the first revise attempt without escalating to Recovery', async () => {
      const { graph, coach, recovery, plannedSessions } = setup();
      plannedSessions.findById.mockResolvedValue(Promise.resolve(plannedSession({ id: 'sess-1' })));

      const finalState = await graph.run(
        initialState({
          scenario: 'session_edit',
          sessionEditRequest: { plannedSessionId: 'sess-1', requestedChangeDescription: 'add a mile' },
        }),
      );

      expect(finalState.status).toBe('committed');
      expect(coach.reviseSessionContent).toHaveBeenCalledTimes(1);
      expect(recovery.assessReadiness).not.toHaveBeenCalled();
    });

    it('escalates when the first revise fails: bumps the target on green readiness and retries', async () => {
      const { graph, coach, recovery, plannedSessions } = setup();
      plannedSessions.findById.mockResolvedValue(Promise.resolve(plannedSession({ id: 'sess-1' })));
      coach.reviseSessionContent
        .mockResolvedValueOnce(loopResult(null) as never)
        .mockResolvedValueOnce(loopResult({} as never));
      recovery.assessReadiness.mockResolvedValueOnce(loopResult(verdict('green')));

      const finalState = await graph.run(
        initialState({
          scenario: 'session_edit',
          sessionEditRequest: { plannedSessionId: 'sess-1', requestedChangeDescription: 'add a mile' },
        }),
      );

      expect(coach.reviseWeeklyTargets).toHaveBeenCalledTimes(1);
      expect(coach.reviseWeeklyTargets).toHaveBeenCalledWith(
        USER_ID,
        PROGRAM_ID,
        WEEK_INDEX,
        { sessionCount: 4, totalVolume: 44, keyGoals: ['tempo'] },
        'session_edit',
        expect.any(String),
      );
      expect(coach.reviseSessionContent).toHaveBeenCalledTimes(2);
      expect(finalState.status).toBe('committed');
    });

    it('aborts with a readable reason (no throw) when sessionEditRequest is null', async () => {
      const { graph, coach } = setup();

      const finalState = await graph.run(
        initialState({ scenario: 'session_edit', sessionEditRequest: null }),
      );

      expect(finalState.status).toBe('aborted');
      expect(finalState.abortReason).toMatch(/couldn't tell which session this change targets/i);
      expect(finalState.abortReason).toMatch(/stopped rather than guess/i);
      expect(finalState.writesPerformed).toBe(false);
      expect(coach.reviseSessionContent).not.toHaveBeenCalled();
    });

    it('marks writesPerformed after a successful session edit', async () => {
      const { graph, plannedSessions } = setup();
      plannedSessions.findById.mockResolvedValue(Promise.resolve(plannedSession({ id: 'sess-1' })));

      const finalState = await graph.run(
        initialState({
          scenario: 'session_edit',
          sessionEditRequest: { plannedSessionId: 'sess-1', requestedChangeDescription: 'add a mile' },
        }),
      );

      expect(finalState.writesPerformed).toBe(true);
    });
  });

  describe('session_time_edit', () => {
    it('happy path: uses the requested slot directly when it validates clean, skipping propose', async () => {
      const { graph, planner, commandBus, plannedSessions } = setup();
      plannedSessions.findById.mockResolvedValue(
        Promise.resolve(
          plannedSession({ id: 'sess-3', estDurationMin: 45, scheduledDate: '2026-07-06', startTime: '06:00' }),
        ),
      );
      planner.validateSlot.mockResolvedValueOnce([]);

      const finalState = await graph.run(
        initialState({
          scenario: 'session_time_edit',
          sessionTimeEditRequest: {
            plannedSessionId: 'sess-3',
            requestedDate: '2026-07-08',
            requestedStartTime: '07:00',
          },
        }),
      );

      expect(planner.proposeSlotsForSession).not.toHaveBeenCalled();
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          plannedSessionId: 'sess-3',
          schedule: expect.objectContaining({
            scheduledDate: '2026-07-08',
            startTime: '07:00',
            endTime: '07:45',
          }),
        }),
      );
      expect(finalState.status).toBe('committed');
    });

    it('falls through to proposeSlotsForSession when no slot is requested, and aborts if none is free', async () => {
      const { graph, planner, plannedSessions, commandBus } = setup();
      plannedSessions.findById.mockResolvedValue(Promise.resolve(plannedSession({ id: 'sess-4' })));
      planner.proposeSlotsForSession.mockResolvedValueOnce([]);

      const finalState = await graph.run(
        initialState({
          scenario: 'session_time_edit',
          sessionTimeEditRequest: {
            plannedSessionId: 'sess-4',
            requestedDate: null,
            requestedStartTime: null,
          },
        }),
      );

      expect(planner.proposeSlotsForSession).toHaveBeenCalledTimes(1);
      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(finalState.status).toBe('aborted');
      expect(finalState.abortReason).toMatch(/no clash-free slot/i);
      expect(finalState.writesPerformed).toBe(false);
    });

    it('aborts with a readable reason (no throw) when sessionTimeEditRequest is null', async () => {
      const { graph, commandBus, planner, plannedSessions } = setup();

      const finalState = await graph.run(
        initialState({ scenario: 'session_time_edit', sessionTimeEditRequest: null }),
      );

      expect(finalState.status).toBe('aborted');
      expect(finalState.abortReason).toMatch(/couldn't tell which session you wanted to move/i);
      expect(finalState.abortReason).toMatch(/stopped rather than guess/i);
      expect(finalState.writesPerformed).toBe(false);
      expect(plannedSessions.findById).not.toHaveBeenCalled();
      expect(planner.validateSlot).not.toHaveBeenCalled();
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('marks writesPerformed after the schedule upsert lands', async () => {
      const { graph, plannedSessions } = setup();
      plannedSessions.findById.mockResolvedValue(Promise.resolve(plannedSession({ id: 'sess-3' })));

      const finalState = await graph.run(
        initialState({
          scenario: 'session_time_edit',
          sessionTimeEditRequest: {
            plannedSessionId: 'sess-3',
            requestedDate: '2026-07-08',
            requestedStartTime: '07:00',
          },
        }),
      );

      expect(finalState.status).toBe('committed');
      expect(finalState.writesPerformed).toBe(true);
    });
  });
});
