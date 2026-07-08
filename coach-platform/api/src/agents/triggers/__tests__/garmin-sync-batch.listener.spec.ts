import { AppendMessageCommand } from '../../conversation/application/commands/append-message.command';
import { SetPendingCardBatchCommand } from '../../conversation/application/commands/set-pending-card-batch.command';
import { StartConversationCommand } from '../../conversation/application/commands/start-conversation.command';
import { GetGarminSyncScheduleQuery } from '../../../ingestion/garmin-sync-schedule/application/queries/get-garmin-sync-schedule.query';
import { GarminSyncSchedule } from '../../../ingestion/garmin-sync-schedule/domain/garmin-sync-schedule.model';
import { ApprovalBatchView } from '../../approval/approval.service';
import { GarminSyncBatchRecordedEvent } from '../../shared/queue/events/garmin-sync-batch-recorded.event';
import { GarminSyncBatchListener } from '../garmin-sync-batch.listener';

function cardView(
  overrides: Partial<ApprovalBatchView> = {},
): ApprovalBatchView {
  return {
    programId: 'p1',
    weekIndex: 1,
    cards: [
      {
        sessionId: 's1',
        slotKey: 'mon-am',
        type: 'run',
        title: 'Easy run',
        scheduledDate: '2026-07-08',
        startTime: '07:00',
        endTime: '07:45',
        intensityLabel: 'easy',
        estDurationMin: 45,
        coachNotes: null,
        running: null,
        strength: null,
        placementNote: null,
        diffStatus: 'modified',
        changedFields: ['estDurationMin'],
      },
    ],
    allowedActions: ['approve'],
    batchId: 'batch-1',
    status: 'pending',
    kind: 'user_initiated',
    conversationId: null,
    reason: null,
    ...overrides,
  };
}

function event(overrides: Partial<GarminSyncBatchRecordedEvent['payload']> = {}) {
  return new GarminSyncBatchRecordedEvent({
    userId: 'u1',
    programId: 'p1',
    weekIndex: 1,
    batchId: 'batch-1',
    runId: 'garmin-sync:u1:2026-07-08:04:00',
    ...overrides,
  });
}

function makeListener(opts: {
  view: ApprovalBatchView;
  mode: GarminSyncSchedule['mode'];
}) {
  const approval = {
    getBatchView: jest.fn().mockResolvedValue(opts.view),
    approveByBatch: jest.fn().mockResolvedValue({ committed: 1, calendar: { synced: 0, failed: 0 } }),
  };
  const commandBus = {
    execute: jest.fn(async (cmd: unknown) => {
      if (cmd instanceof StartConversationCommand) {
        return { conversationId: 'c-new' };
      }
      return undefined;
    }),
  };
  const queryBus = {
    execute: jest.fn(async (q: unknown) => {
      if (q instanceof GetGarminSyncScheduleQuery) {
        return {
          userId: 'u1',
          syncTimesLocal: ['04:00'],
          mode: opts.mode,
          enabled: true,
          lastFiredAt: {},
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        } satisfies GarminSyncSchedule;
      }
      return null;
    }),
  };
  const telemetry = { emitConversationOpened: jest.fn() };

  const listener = new GarminSyncBatchListener(
    commandBus as never,
    queryBus as never,
    approval as never,
    telemetry as never,
  );
  return { listener, approval, commandBus, queryBus, telemetry };
}

describe('GarminSyncBatchListener', () => {
  it('plan mode: opens a plan/attention conversation and links the pending batch, without approving anything', async () => {
    const { listener, approval, commandBus, telemetry } = makeListener({
      view: cardView(),
      mode: 'plan',
    });

    await listener.handle(event());

    expect(approval.approveByBatch).not.toHaveBeenCalled();

    const start = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof StartConversationCommand) as StartConversationCommand;
    expect(start).toMatchObject({
      userId: 'u1',
      opts: { origin: 'system', mode: 'plan', attention: true },
    });

    const append = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof AppendMessageCommand) as AppendMessageCommand;
    expect(append.meta).toEqual({ cardBatchId: 'batch-1' });

    const link = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof SetPendingCardBatchCommand) as SetPendingCardBatchCommand;
    expect(link).toMatchObject({ conversationId: 'c-new', cardBatchId: 'batch-1' });

    expect(telemetry.emitConversationOpened).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', conversationId: 'c-new', attention: true }),
    );
  });

  it('auto mode: approves the batch, then opens an attention conversation reporting the change', async () => {
    const { listener, approval, commandBus } = makeListener({
      view: cardView(),
      mode: 'auto',
    });

    await listener.handle(event());

    expect(approval.approveByBatch).toHaveBeenCalledWith('u1', 'batch-1');

    const start = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof StartConversationCommand) as StartConversationCommand;
    expect(start).toMatchObject({ userId: 'u1', opts: { attention: true } });

    expect(
      commandBus.execute.mock.calls.some((c) => c[0] instanceof SetPendingCardBatchCommand),
    ).toBe(false);
  });

  it('stays silent when the sync produced no real diff', async () => {
    const { listener, approval, commandBus } = makeListener({
      view: cardView({
        cards: [
          {
            sessionId: 's1',
            slotKey: 'mon-am',
            type: 'run',
            title: 'Easy run',
            scheduledDate: '2026-07-08',
            startTime: '07:00',
            endTime: '07:45',
            intensityLabel: 'easy',
            estDurationMin: 45,
            coachNotes: null,
            running: null,
            strength: null,
            placementNote: null,
            diffStatus: 'unchanged',
            changedFields: [],
          },
        ],
      }),
      mode: 'auto',
    });

    await listener.handle(event());

    expect(approval.approveByBatch).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
