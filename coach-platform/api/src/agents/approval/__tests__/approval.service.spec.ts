import { CommitWeekCommand } from '../../../planned-sessions/application/commands/commit-week.command';
import { DiscardTentativeWeekCommand } from '../../../planned-sessions/application/commands/discard-tentative-week.command';
import { PlannedSessionResponse } from '../../../planned-sessions/application/dto/planned-session.response';
import { GetWeekQuery } from '../../../planned-sessions/application/queries/get-week.query';
import { GetActiveProgramQuery } from '../../../program/application/queries/get-active-program.query';
import { FlushConversationPreferencesCommand } from '../../assistant/flush-conversation-preferences.command';
import { ApprovalService } from '../approval.service';
import { PendingCardBatch } from '../domain/pending-card-batch.model';

function session(
  overrides: Partial<PlannedSessionResponse> = {},
): PlannedSessionResponse {
  return {
    id: 's1',
    programId: 'p1',
    weekIndex: 2,
    slotKey: 'w2-d0',
    type: 'running',
    scheduledDate: '2026-06-29',
    startTime: '07:00',
    endTime: '07:45',
    timezone: 'UTC',
    scheduledStartUtc: '2026-06-29T07:00:00.000Z',
    planState: 'tentative',
    title: 'Tempo Run',
    estDurationMin: 45,
    intensityLabel: 'moderate',
    coachNotes: 'reduced per your note',
    running: {
      runType: 'tempo',
      totalDistanceKm: 6,
      totalDurationMin: null,
      targetPace: '5:00/km',
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

const batch: PendingCardBatch = {
  id: 'batch-1',
  userId: 'u1',
  programId: 'p1',
  weekIndex: 2,
  kind: 'user_initiated',
  status: 'pending',
  runId: 'run-1',
  conversationId: null,
  sessionStartUtc: null,
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
};

describe('ApprovalService.approveByBatch — action-point buffer flush', () => {
  function makeApproveService(conversationId: string | null) {
    const fromBatch: PendingCardBatch = { ...batch, conversationId };
    const commandBus = { execute: jest.fn() };
    const queryBus = { execute: jest.fn() };
    const calendarSync = {
      syncWeek: jest.fn().mockResolvedValue({ synced: 1, failed: 0 }),
    };
    const batches = {
      get: jest.fn().mockResolvedValue(fromBatch),
      setStatus: jest.fn().mockResolvedValue(undefined),
    };

    queryBus.execute.mockImplementation(async (q: unknown) => {
      if (q instanceof GetWeekQuery) return [session()];
      if (q instanceof GetActiveProgramQuery) {
        return {
          program: {
            id: 'p1',
            discipline: 'running',
            currentWeekIndex: 2,
            weeks: [{ weekIndex: 2, planState: 'tentative', status: 'current' }],
          },
        };
      }
      return null;
    });
    commandBus.execute.mockImplementation(async (c: unknown) => {
      if (c instanceof CommitWeekCommand) return { committed: 1 };
      return {};
    });

    const buildOrchestrator = {
      advanceAfterSessionApproved: jest.fn().mockResolvedValue(null),
      lockWeekIfComplete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ApprovalService(
      queryBus as never,
      commandBus as never,
      calendarSync as never,
      batches as never,
      buildOrchestrator as never,
    );
    return { service, commandBus };
  }

  it('flushes the conversation staging buffer when the batch has a thread', async () => {
    const { service, commandBus } = makeApproveService('conv-9');
    await service.approveByBatch('u1', 'batch-1');

    const flush = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof FlushConversationPreferencesCommand) as
      | FlushConversationPreferencesCommand
      | undefined;
    expect(flush).toBeDefined();
    expect(flush).toMatchObject({
      userId: 'u1',
      conversationId: 'conv-9',
      runId: 'run-1',
      discipline: 'running',
    });
  });

  it('does not flush when the batch has no originating thread', async () => {
    const { service, commandBus } = makeApproveService(null);
    await service.approveByBatch('u1', 'batch-1');

    const flushed = commandBus.execute.mock.calls
      .map((c) => c[0])
      .some((c) => c instanceof FlushConversationPreferencesCommand);
    expect(flushed).toBe(false);
  });
});

describe('ApprovalService.rejectByBatch — build_session reopens a discussion', () => {
  function makeService(opts: {
    conversationId: string | null;
    committedFallback?: boolean;
  }) {
    const buildSessionBatch: PendingCardBatch = {
      ...batch,
      kind: 'build_session',
      conversationId: opts.conversationId,
    };
    const commandBus = { execute: jest.fn() };
    const queryBus = { execute: jest.fn() };
    const calendarSync = { syncWeek: jest.fn() };
    const batches = {
      get: jest.fn().mockResolvedValue(buildSessionBatch),
      setStatus: jest.fn().mockResolvedValue(undefined),
    };
    queryBus.execute.mockImplementation(async (q: unknown) => {
      if (q instanceof GetWeekQuery) {
        return opts.committedFallback
          ? [session({ planState: 'committed' })]
          : [];
      }
      return null;
    });
    const buildOrchestrator = {
      openSessionRevision: jest.fn().mockResolvedValue('What would you like changed?'),
      advanceAfterSessionApproved: jest.fn().mockResolvedValue(null),
      lockWeekIfComplete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ApprovalService(
      queryBus as never,
      commandBus as never,
      calendarSync as never,
      batches as never,
      buildOrchestrator as never,
    );
    return { service, commandBus, batches, buildOrchestrator };
  }

  it('marks the batch rejected and opens a discussion — even with no committed fallback (the week\'s first session)', async () => {
    const { service, commandBus, batches, buildOrchestrator } = makeService({
      conversationId: 'conv-1',
      committedFallback: false,
    });

    const result = await service.rejectByBatch('u1', 'batch-1');

    expect(batches.setStatus).toHaveBeenCalledWith('u1', 'batch-1', 'rejected');
    expect(buildOrchestrator.openSessionRevision).toHaveBeenCalledWith(
      'u1',
      'conv-1',
    );
    // Never discards the tentative session — a redraft naturally replaces it.
    const discardCmd = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof DiscardTentativeWeekCommand);
    expect(discardCmd).toBeUndefined();
    expect(result).toEqual({ discarded: 0 });
  });

  it('does not call the orchestrator when the batch has no originating conversation', async () => {
    const { service, buildOrchestrator } = makeService({ conversationId: null });

    await service.rejectByBatch('u1', 'batch-1');

    expect(buildOrchestrator.openSessionRevision).not.toHaveBeenCalled();
  });
});
