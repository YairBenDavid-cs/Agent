import { AppendMessageCommand } from '../../conversation/application/commands/append-message.command';
import { SetPendingCardBatchCommand } from '../../conversation/application/commands/set-pending-card-batch.command';
import { UpsertSessionScheduleCommand } from '../../../planned-sessions/application/commands/upsert-session-schedule.command';
import { CommitSkeletonCommand } from '../../../program/application/commands/commit-skeleton.command';
import { GetActiveProgramQuery } from '../../../program/application/queries/get-active-program.query';
import { GetWeekQuery } from '../../../planned-sessions/application/queries/get-week.query';
import { GetUserQuery } from '../../../users/application/queries/get-user.query';
import { ProgramWeek, WeeklyTargets } from '../../../program/domain/program.model';
import { BuildConversationOrchestrator } from '../build-conversation.orchestrator';

/**
 * Focused unit coverage for the build orchestrator's drafting (BW2) and slot
 * negotiation (BW3) paths: drafting opens a `build_session` card; approving
 * advances; once the quota is met the build hands off to scheduling, proposes
 * clash-free slots, and a confirmed pick schedules + (when last) locks the week.
 */
describe('BuildConversationOrchestrator', () => {
  const PROGRAM_ID = 'p1';

  function lockedTargets(overrides: Partial<WeeklyTargets> = {}): WeeklyTargets {
    return {
      sessionCount: 3,
      totalVolume: 30,
      keyGoals: ['one quality tempo'],
      lockedAt: '2026-06-29T00:00:00.000Z',
      ...overrides,
    };
  }

  function week(overrides: Partial<ProgramWeek> = {}): ProgramWeek {
    return {
      weekIndex: 0,
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      theme: 'base',
      plannedLoadTarget: null,
      planState: 'committed',
      status: 'current',
      generatedAt: null,
      weekState: 'targets_locked',
      weeklyTargets: lockedTargets(),
      ...overrides,
    };
  }

  function committedSession(
    slotKey: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: `id-${slotKey}`,
      programId: PROGRAM_ID,
      weekIndex: 0,
      slotKey,
      type: 'running',
      scheduledDate: '2026-07-01',
      startTime: '07:00',
      endTime: '07:40',
      timezone: 'Europe/Berlin',
      scheduledStartUtc: '2026-07-01T05:00:00.000Z',
      planState: 'committed',
      title: `Run ${slotKey}`,
      estDurationMin: 40,
      intensityLabel: 'easy',
      coachNotes: null,
      running: { totalDistanceKm: 5 },
      strength: null,
      calendarSync: null,
      ...overrides,
    };
  }

  // A tentative (proposed-but-unlocked) targets block: present, `lockedAt: null`.
  // With `weekState: 'open'` this resolves to AWAIT_TARGETS_CONSENT.
  function tentativeTargets(overrides: Partial<WeeklyTargets> = {}): WeeklyTargets {
    return { ...lockedTargets(), lockedAt: null as never, ...overrides };
  }

  function makeOrchestrator(opts: {
    weekOverrides?: Partial<ProgramWeek>;
    // Dynamic week resolution: when set, the GetActiveProgramQuery mock calls
    // this each time, so a test can flip weekState after the coach "locks"
    // targets (mirroring the real lock side effect the coach mock can't perform).
    weekProvider?: () => ProgramWeek;
    sessions: ReturnType<typeof committedSession>[];
    pendingCardBatchId?: string | null;
    messages?: Array<{ role: string; meta?: unknown }>;
    coachOverrides?: Record<string, unknown>;
    slotCandidates?: Array<{
      scheduledDate: string;
      startTime: string;
      endTime: string;
      scheduledStartUtc: string;
    }>;
    slotViolations?: string[];
    // Full control over the active program's week list (defaults to the
    // single resolved week). Used to simulate a program whose skeleton
    // already has later weeks laid down.
    programWeeks?: () => ProgramWeek[];
  }) {
    const appended: string[] = [];
    let messageSeq = 0;

    const commandBus = {
      execute: jest.fn(async (cmd: unknown) => {
        if (cmd instanceof AppendMessageCommand) {
          appended.push((cmd as AppendMessageCommand).content);
          messageSeq += 1;
          return { message: { id: `m${messageSeq}` } };
        }
        return {};
      }),
    };

    const queryBus = {
      execute: jest.fn(async (q: unknown) => {
        if (q instanceof GetActiveProgramQuery) {
          const resolvedWeek = opts.weekProvider
            ? opts.weekProvider()
            : week(opts.weekOverrides);
          return {
            program: {
              id: PROGRAM_ID,
              discipline: 'running',
              currentWeekIndex: 0,
              weeks: opts.programWeeks ? opts.programWeeks() : [resolvedWeek],
            },
          };
        }
        if (q instanceof GetWeekQuery) {
          return opts.sessions;
        }
        if (q instanceof GetUserQuery) {
          return { timezone: 'Europe/Berlin' };
        }
        return null;
      }),
    };

    const coach = {
      draftNextSession: jest.fn().mockResolvedValue({
        terminalTool: 'draft_next_session',
        finalText: 'Here is your next run.',
      }),
      resolveTargetsConsent: jest
        .fn()
        .mockResolvedValue({ finalText: 'How about 4 runs instead?' }),
      generateProgram: jest.fn().mockResolvedValue({ finalText: 'Skeleton laid down.' }),
      proposeWeeklyTargets: jest
        .fn()
        .mockResolvedValue({ finalText: 'Here are this week’s targets.' }),
      ...(opts.coachOverrides ?? {}),
    };
    const candidates =
      opts.slotCandidates ??
      [
        {
          scheduledDate: '2026-07-01',
          startTime: '07:00',
          endTime: '07:40',
          scheduledStartUtc: '2026-07-01T05:00:00.000Z',
        },
      ];
    const planner = {
      proposeSlotsForSession: jest.fn().mockResolvedValue(candidates),
      validateSlot: jest.fn().mockResolvedValue(opts.slotViolations ?? []),
    };
    const calendarSync = {
      // Mirror a real sync: mark the matching session scheduled so the next
      // phase resolution sees it placed.
      syncWeek: jest.fn(async (_userId: string, sessions: Array<{ id: string }>) => {
        for (const s of sessions) {
          const match = opts.sessions.find((x) => x.id === s.id);
          if (match) {
            match.calendarSync = {
              provider: 'google',
              eventId: `evt-${s.id}`,
              syncedAt: '2026-06-30T00:00:00.000Z',
              syncState: 'synced',
            } as never;
          }
        }
        return { synced: sessions.length, failed: 0 };
      }),
    };
    const telemetry = { emitConversationOpened: jest.fn() };
    const batches = {
      record: jest.fn().mockResolvedValue({ id: 'batch-new' }),
      get: jest.fn().mockResolvedValue(
        opts.pendingCardBatchId
          ? { id: opts.pendingCardBatchId, status: 'pending' }
          : null,
      ),
    };
    const conversations = {
      findConversation: jest.fn().mockResolvedValue({
        buildContext: { programId: PROGRAM_ID, weekIndex: 0 },
        pendingCardBatchId: opts.pendingCardBatchId ?? null,
      }),
      listMessages: jest
        .fn()
        .mockResolvedValue({ items: opts.messages ?? [], nextCursor: null }),
    };

    const orchestrator = new BuildConversationOrchestrator(
      commandBus as never,
      queryBus as never,
      coach as never,
      planner as never,
      calendarSync as never,
      telemetry as never,
      batches as never,
      conversations as never,
    );
    return {
      orchestrator,
      commandBus,
      coach,
      planner,
      calendarSync,
      telemetry,
      batches,
      conversations,
      appended,
    };
  }

  it('drafts the next session and opens a build_session card on a DRAFT_SESSION turn', async () => {
    const { orchestrator, coach, batches, commandBus, appended } =
      makeOrchestrator({ sessions: [committedSession('run-1')] });

    const result = await orchestrator.handleTurn({
      userId: 'u1',
      conversationId: 'c1',
      message: 'go',
      discipline: 'running',
    });

    expect(coach.draftNextSession).toHaveBeenCalledTimes(1);
    // committed slotKeys + targets are threaded into the coach call.
    const draftArgs = coach.draftNextSession.mock.calls[0][3];
    expect(draftArgs).toMatchObject({
      programId: PROGRAM_ID,
      timezone: 'Europe/Berlin',
      committedSlotKeys: ['run-1'],
      targets: { sessionCount: 3 },
    });

    expect(batches.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'build_session', conversationId: 'c1' }),
    );
    const setBatch = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof SetPendingCardBatchCommand) as
      | SetPendingCardBatchCommand
      | undefined;
    expect(setBatch).toMatchObject({ cardBatchId: 'batch-new' });

    // A drafted session's decision is owned by its card — not a yes/no consent
    // gate — so the turn advertises the card id and leaves awaitingConfirmation off.
    expect(result?.awaitingConfirmation).toBe(false);
    expect(result?.pendingCardBatchId).toBe('batch-new');
    expect(appended).toContain('Here is your next run.');
  });

  it('waits (no re-draft on its own) while a session card is pending — a reply re-drafts', async () => {
    const { orchestrator, coach } = makeOrchestrator({
      sessions: [committedSession('run-1')],
      pendingCardBatchId: 'batch-open',
    });

    // A pending card → AWAIT_SESSION_CONSENT. A chat reply is an adjustment that
    // re-drafts the session (superseding the open card).
    await orchestrator.handleTurn({
      userId: 'u1',
      conversationId: 'c1',
      message: 'make it shorter',
      discipline: 'running',
    });
    expect(coach.draftNextSession).toHaveBeenCalledTimes(1);
  });

  it('after approval, advances by drafting the next session while quota remains', async () => {
    const { orchestrator, coach } = makeOrchestrator({
      sessions: [committedSession('run-1'), committedSession('run-2')],
    });

    const reply = await orchestrator.advanceAfterSessionApproved('u1', 'c1');
    expect(coach.draftNextSession).toHaveBeenCalledTimes(1);
    expect(reply).toBe('Here is your next run.');
  });

  it('after approval, hands off + proposes the first slot once the quota is met', async () => {
    const { orchestrator, coach, planner, appended } = makeOrchestrator({
      sessions: [
        committedSession('run-1'),
        committedSession('run-2'),
        committedSession('run-3'),
      ],
    });

    const reply = await orchestrator.advanceAfterSessionApproved('u1', 'c1');
    // No more drafting; we move into scheduling.
    expect(coach.draftNextSession).not.toHaveBeenCalled();
    // The scheduling hand-off is posted…
    expect(appended.some((m) => /time on your calendar/i.test(m))).toBe(true);
    // …then the first session's slots are proposed (the returned reply).
    expect(planner.proposeSlotsForSession).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/pick the one/i);
  });

  it('after targets lock, auto-continues to draft session 1 in the same turn (B1)', async () => {
    // A passed targets-consent gate must flow straight into the first session
    // draft without waiting for another user message. The coach "locks" the
    // targets; we flip the week to targets_locked so the reload draws DRAFT_SESSION.
    let locked = false;
    const { orchestrator, coach, batches, appended } = makeOrchestrator({
      sessions: [], // no sessions yet → after lock, quota (3) > 0 → DRAFT_SESSION
      weekProvider: () =>
        locked
          ? week({ weekState: 'targets_locked', weeklyTargets: lockedTargets() })
          : week({ weekState: 'open', weeklyTargets: tentativeTargets() }),
      coachOverrides: {
        resolveTargetsConsent: jest.fn(async () => {
          locked = true;
          return { terminalTool: 'lock_weekly_targets' as const };
        }),
      },
    });

    const result = await orchestrator.handleTurn({
      userId: 'u1',
      conversationId: 'c1',
      message: 'looks good, lock it',
      discipline: 'running',
    });

    // The lock is confirmed AND the first session is drafted in the SAME turn.
    expect(coach.resolveTargetsConsent).toHaveBeenCalledTimes(1);
    expect(coach.draftNextSession).toHaveBeenCalledTimes(1);
    expect(appended.some((m) => /lock/i.test(m))).toBe(true);
    expect(appended).toContain('Here is your next run.');
    // A build_session card opens for the just-drafted session, gating the turn.
    expect(batches.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'build_session', conversationId: 'c1' }),
    );
    // The drafted session is card-owned, not a yes/no consent: the turn advertises
    // the card id and leaves awaitingConfirmation off.
    expect(result?.awaitingConfirmation).toBe(false);
    expect(result?.pendingCardBatchId).toBe('batch-new');
  });

  it('PROPOSE_SLOTS turn posts pickable candidates as slotProposal meta', async () => {
    const { orchestrator, commandBus, planner } = makeOrchestrator({
      sessions: [
        committedSession('run-1'),
        committedSession('run-2'),
        committedSession('run-3'),
      ],
    });

    const result = await orchestrator.handleTurn({
      userId: 'u1',
      conversationId: 'c1',
      message: 'ok',
      discipline: 'running',
    });

    expect(planner.proposeSlotsForSession).toHaveBeenCalledTimes(1);
    expect(result?.awaitingConfirmation).toBe(true);
    const appendCmd = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof AppendMessageCommand) as
      | AppendMessageCommand
      | undefined;
    expect(appendCmd?.meta?.slotProposal).toMatchObject({
      plannedSessionId: 'id-run-1',
    });
    expect(appendCmd?.meta?.slotProposal?.candidates.length).toBeGreaterThan(0);
  });

  it('confirmSlot schedules the session, writes the calendar event, and locks the last week', async () => {
    const slot = {
      scheduledDate: '2026-07-01',
      startTime: '07:00',
      endTime: '07:40',
      scheduledStartUtc: '2026-07-01T05:00:00.000Z',
    };
    const { orchestrator, commandBus, calendarSync } = makeOrchestrator({
      // Single-session week so confirming the only slot completes the build.
      weekOverrides: { weeklyTargets: lockedTargets({ sessionCount: 1 }) },
      sessions: [committedSession('run-1', { calendarSync: null })],
      messages: [
        {
          role: 'assistant',
          meta: { slotProposal: { plannedSessionId: 'id-run-1', candidates: [slot] } },
        },
      ],
      slotCandidates: [slot],
    });

    const result = await orchestrator.confirmSlot(
      'u1',
      'c1',
      slot.scheduledStartUtc,
    );

    const scheduleCmd = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof UpsertSessionScheduleCommand) as
      | UpsertSessionScheduleCommand
      | undefined;
    expect(scheduleCmd).toMatchObject({
      plannedSessionId: 'id-run-1',
      schedule: { scheduledStartUtc: slot.scheduledStartUtc },
    });
    expect(calendarSync.syncWeek).toHaveBeenCalledTimes(1);
    // Last session placed → week is locked via a skeleton re-commit.
    const lockCmd = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof CommitSkeletonCommand) as
      | CommitSkeletonCommand
      | undefined;
    expect(lockCmd?.weeks.find((w) => w.weekIndex === 0)?.weekState).toBe(
      'locked',
    );
    expect(result?.reply).toMatch(/on the calendar/i);
  });

  it('resumeBuild re-greets an unperformed action phase and re-surfaces attention', async () => {
    const { orchestrator, planner, telemetry } = makeOrchestrator({
      sessions: [
        committedSession('run-1'),
        committedSession('run-2'),
        committedSession('run-3'),
      ],
    });

    // All committed, none scheduled, no slot proposal yet → PROPOSE_SLOTS.
    const result = await orchestrator.resumeBuild('u1', 'c1');
    expect(planner.proposeSlotsForSession).toHaveBeenCalledTimes(1);
    expect(result?.awaitingConfirmation).toBe(true);
    expect(telemetry.emitConversationOpened).toHaveBeenCalledWith(
      expect.objectContaining({ attention: true, origin: 'system' }),
    );
  });

  it('resumeBuild is a no-op when the build already sits at a consent gate', async () => {
    const { orchestrator, planner, coach, telemetry } = makeOrchestrator({
      sessions: [committedSession('run-1')],
      pendingCardBatchId: 'batch-open', // → AWAIT_SESSION_CONSENT
    });

    const result = await orchestrator.resumeBuild('u1', 'c1');
    expect(result).toBeNull();
    expect(planner.proposeSlotsForSession).not.toHaveBeenCalled();
    expect(coach.draftNextSession).not.toHaveBeenCalled();
    expect(telemetry.emitConversationOpened).not.toHaveBeenCalled();
  });

  it('flags a turn buildRetry when the Coach run aborts (recoverable failure)', async () => {
    const { orchestrator, coach, commandBus } = makeOrchestrator({
      sessions: [committedSession('run-1')], // committed 1 < 3 → DRAFT_SESSION
    });
    coach.draftNextSession.mockRejectedValueOnce(new Error('OPENAI_NOT_CONFIGURED'));

    const result = await orchestrator.handleTurn({
      userId: 'u1',
      conversationId: 'c1',
      message: 'go',
      discipline: 'running',
    });

    // The turn stays awaiting (a reply retries) and is flagged for the FE.
    expect(result?.awaitingConfirmation).toBe(true);
    const failMsg = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof AppendMessageCommand) as
      | AppendMessageCommand
      | undefined;
    expect(failMsg?.meta?.buildRetry).toBe(true);
  });

  it('confirmSlot re-proposes fresh slots when the pick has gone stale', async () => {
    const slot = {
      scheduledDate: '2026-07-01',
      startTime: '07:00',
      endTime: '07:40',
      scheduledStartUtc: '2026-07-01T05:00:00.000Z',
    };
    const { orchestrator, commandBus, planner } = makeOrchestrator({
      sessions: [committedSession('run-1', { calendarSync: null })],
      weekOverrides: { weeklyTargets: lockedTargets({ sessionCount: 1 }) },
      messages: [
        {
          role: 'assistant',
          meta: { slotProposal: { plannedSessionId: 'id-run-1', candidates: [slot] } },
        },
      ],
      slotCandidates: [slot],
      slotViolations: ['busy clash at 07:00'],
    });

    await orchestrator.confirmSlot('u1', 'c1', slot.scheduledStartUtc);

    // Stale → never writes the schedule, re-proposes instead.
    const scheduleCmd = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof UpsertSessionScheduleCommand);
    expect(scheduleCmd).toBeUndefined();
    // proposeSlotsForSession is called twice: not at all before validate here,
    // but once for the re-proposal after the stale check.
    expect(planner.proposeSlotsForSession).toHaveBeenCalled();
  });

  describe('startBuild', () => {
    it('lays down the skeleton on the very first build (bare seed, one placeholder week)', async () => {
      const { orchestrator, coach, appended } = makeOrchestrator({
        sessions: [],
        programWeeks: () => [week({ weekIndex: 0 })],
      });

      await orchestrator.startBuild({
        userId: 'u1',
        conversationId: 'c1',
        title: 'Week 1 planning',
        programId: PROGRAM_ID,
        discipline: 'running',
        weekIndex: 0,
      });

      expect(coach.generateProgram).toHaveBeenCalledTimes(1);
      expect(coach.proposeWeeklyTargets).toHaveBeenCalledTimes(1);
      expect(appended).toContain('Here are this week’s targets.');
    });

    it('never regenerates the skeleton once later weeks already exist — proposes targets only', async () => {
      const { orchestrator, coach } = makeOrchestrator({
        sessions: [],
        programWeeks: () => [
          week({ weekIndex: 0, status: 'done' }),
          week({ weekIndex: 1, status: 'current', weekState: 'open', weeklyTargets: null }),
        ],
      });

      await orchestrator.startBuild({
        userId: 'u1',
        conversationId: 'c1',
        title: 'Week 2 planning',
        programId: PROGRAM_ID,
        discipline: 'running',
        weekIndex: 1,
      });

      expect(coach.generateProgram).not.toHaveBeenCalled();
      expect(coach.proposeWeeklyTargets).toHaveBeenCalledTimes(1);
      expect(coach.proposeWeeklyTargets).toHaveBeenCalledWith(
        'u1',
        expect.any(String),
        'running',
        { weekIndex: 1 },
      );
    });
  });
});
