import { QueryBus } from '@nestjs/cqrs';
import { PlannedSessionResponse } from '../../../planned-sessions/application/dto/planned-session.response';
import { PendingCardBatch } from '../domain/pending-card-batch.model';
import { NewCardBatch } from '../domain/pending-card-batch.repository.port';
import { PendingCardBatchService } from '../pending-card-batch.service';

// record() reads the week, derives the session-day commit deadline from the
// earliest TENTATIVE session start, and delegates supersession to the repo.

function session(
  overrides: Partial<PlannedSessionResponse> = {},
): PlannedSessionResponse {
  return {
    planState: 'tentative',
    scheduledStartUtc: '2026-07-07T06:00:00.000Z',
    ...overrides,
  } as PlannedSessionResponse;
}

function makeService(week: PlannedSessionResponse[], create: jest.Mock) {
  const queryBus = {
    execute: jest.fn().mockResolvedValue(week),
  } as unknown as QueryBus;
  const service = new PendingCardBatchService(
    { createSuperseding: create } as never,
    queryBus,
  );
  return { service, queryBus };
}

function recorded(overrides: Partial<PendingCardBatch> = {}): PendingCardBatch {
  return {
    id: 'batch-1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    kind: 'user_initiated',
    status: 'pending',
    runId: 'run-1',
    conversationId: null,
    sessionStartUtc: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PendingCardBatchService.record', () => {
  it('derives sessionStartUtc from the earliest tentative session start', async () => {
    let captured!: NewCardBatch;
    const create = jest.fn((input: NewCardBatch) => {
      captured = input;
      return Promise.resolve(recorded({ sessionStartUtc: input.sessionStartUtc }));
    });
    const { service } = makeService(
      [
        session({ scheduledStartUtc: '2026-07-09T18:00:00.000Z' }),
        session({ scheduledStartUtc: '2026-07-07T06:00:00.000Z' }),
        session({ scheduledStartUtc: '2026-07-08T07:00:00.000Z' }),
      ],
      create,
    );

    await service.record({
      userId: 'u1',
      programId: 'p1',
      weekIndex: 2,
      kind: 'session_day',
      runId: 'run-1',
    });

    expect(captured.sessionStartUtc).toBe('2026-07-07T06:00:00.000Z');
    expect(captured.kind).toBe('session_day');
    expect(captured.conversationId).toBeNull();
  });

  it('ignores committed rows when computing the deadline', async () => {
    let captured!: NewCardBatch;
    const create = jest.fn((input: NewCardBatch) => {
      captured = input;
      return Promise.resolve(recorded());
    });
    const { service } = makeService(
      [
        session({
          planState: 'committed',
          scheduledStartUtc: '2026-07-05T06:00:00.000Z',
        }),
        session({
          planState: 'tentative',
          scheduledStartUtc: '2026-07-08T06:00:00.000Z',
        }),
      ],
      create,
    );

    await service.record({
      userId: 'u1',
      programId: 'p1',
      weekIndex: 2,
      kind: 'session_day',
      runId: 'run-1',
    });

    expect(captured.sessionStartUtc).toBe('2026-07-08T06:00:00.000Z');
  });

  it('yields a null deadline when no tentative session has a start', async () => {
    let captured!: NewCardBatch;
    const create = jest.fn((input: NewCardBatch) => {
      captured = input;
      return Promise.resolve(recorded());
    });
    const { service } = makeService(
      [session({ planState: 'tentative', scheduledStartUtc: undefined })],
      create,
    );

    await service.record({
      userId: 'u1',
      programId: 'p1',
      weekIndex: 2,
      kind: 'user_initiated',
      runId: 'run-1',
      conversationId: 'c1',
    });

    expect(captured.sessionStartUtc).toBeNull();
    expect(captured.conversationId).toBe('c1');
  });
});
