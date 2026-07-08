import { CoachService } from '../coach.service';

/**
 * The build conversation's three Coach entry points must thread conversation
 * history through `ConversationContextService.buildHistory` — without it, the
 * Coach can't see its own prior question or the athlete's answer, so a
 * multi-turn interview is structurally impossible (root cause of the "grill
 * me" flow not working). These tests pin that wiring so it can't regress.
 */
describe('CoachService — conversation history threading', () => {
  const SEED = {
    discipline: 'running' as const,
    goal: null,
    programId: 'p1',
    currentWeekIndex: 0,
    weekStartDate: '2026-07-01',
    weekEndDate: '2026-07-07',
    seedMessage: 'SEED CONTEXT',
  };

  function makeService() {
    const loop = {
      run: jest.fn().mockResolvedValue({ finalText: 'ok', terminalTool: null }),
    };
    const seeds = { buildCoachSeed: jest.fn().mockResolvedValue(SEED) };
    const readTools = { forCoach: jest.fn().mockReturnValue([]) };
    const commandBus = { execute: jest.fn() };
    const programs = {};
    const plannedSessions = {};
    const conversationContext = {
      buildHistory: jest.fn().mockResolvedValue([]),
    };

    const service = new CoachService(
      loop as never,
      seeds as never,
      readTools as never,
      commandBus as never,
      programs as never,
      plannedSessions as never,
      conversationContext as never,
    );
    return { service, loop, conversationContext };
  }

  it('proposeWeeklyTargets threads history for the given conversation', async () => {
    const { service, loop, conversationContext } = makeService();

    await service.proposeWeeklyTargets('u1', 'run-1', 'running', {
      weekIndex: 0,
      conversationId: 'conv-1',
    });

    expect(conversationContext.buildHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', conversationId: 'conv-1' }),
    );
    expect(loop.run).toHaveBeenCalledWith(
      expect.objectContaining({ history: [] }),
    );
  });

  it('resolveTargetsConsent threads history for the given conversation', async () => {
    const { service, loop, conversationContext } = makeService();

    await service.resolveTargetsConsent('u1', 'run-1', 'running', {
      weekIndex: 0,
      proposed: { sessionCount: 3, totalVolume: 30, keyGoals: [] },
      userMessage: 'looks good',
      conversationId: 'conv-2',
    });

    expect(conversationContext.buildHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', conversationId: 'conv-2' }),
    );
    expect(loop.run).toHaveBeenCalledWith(
      expect.objectContaining({ history: [] }),
    );
  });

  it('draftNextSession threads history for the given conversation', async () => {
    const { service, loop, conversationContext } = makeService();

    await service.draftNextSession('u1', 'run-1', 'running', {
      programId: 'p1',
      weekIndex: 0,
      weekStartDate: '2026-07-01',
      timezone: 'UTC',
      targets: { sessionCount: 3, totalVolume: 30, keyGoals: [] },
      committed: [],
      committedSlotKeys: [],
      conversationId: 'conv-3',
    });

    expect(conversationContext.buildHistory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', conversationId: 'conv-3' }),
    );
    expect(loop.run).toHaveBeenCalledWith(
      expect.objectContaining({ history: [] }),
    );
  });

  it('draftNextSession interpolates the athlete adjustment into the seed message, asking the coach to resolve it before redrafting', async () => {
    const { service, loop } = makeService();

    await service.draftNextSession('u1', 'run-1', 'running', {
      programId: 'p1',
      weekIndex: 0,
      weekStartDate: '2026-07-01',
      timezone: 'UTC',
      targets: { sessionCount: 3, totalVolume: 30, keyGoals: [] },
      committed: [],
      committedSlotKeys: [],
      conversationId: 'conv-3',
      adjustment: 'make it shorter',
    });

    const call = loop.run.mock.calls[0][0] as { seedMessage: string };
    expect(call.seedMessage).toContain('"make it shorter"');
  });

  it('draftNextSession omits the adjustment note when none is given', async () => {
    const { service, loop } = makeService();

    await service.draftNextSession('u1', 'run-1', 'running', {
      programId: 'p1',
      weekIndex: 0,
      weekStartDate: '2026-07-01',
      timezone: 'UTC',
      targets: { sessionCount: 3, totalVolume: 30, keyGoals: [] },
      committed: [],
      committedSlotKeys: [],
      conversationId: 'conv-3',
    });

    const call = loop.run.mock.calls[0][0] as { seedMessage: string };
    expect(call.seedMessage).not.toContain('asked for a change');
  });
});
