import { ApprovalService } from '../approval.service';
import { ApprovalTtlService } from '../approval-ttl.service';
import { PendingCardBatch } from '../domain/pending-card-batch.model';
import { PendingCardBatchService } from '../pending-card-batch.service';

// The sweep is exercised against stubbed collaborators: we assert that each
// pending batch is classified against the clock and mapped onto the right
// approval action + status transition, and that one failure never stalls the rest.

function batch(overrides: Partial<PendingCardBatch> = {}): PendingCardBatch {
  return {
    id: 'b1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 3,
    kind: 'user_initiated',
    status: 'pending',
    runId: 'run-1',
    conversationId: null,
    sessionStartUtc: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeService(
  pending: PendingCardBatch[],
  approval: { approveWeek: jest.Mock; rejectWeek: jest.Mock },
  setStatus: jest.Mock,
): ApprovalTtlService {
  const batches = {
    findAllPending: jest.fn().mockResolvedValue(pending),
    setStatus,
  } as unknown as PendingCardBatchService;
  return new ApprovalTtlService(
    approval as unknown as ApprovalService,
    batches,
  );
}

describe('ApprovalTtlService.sweep', () => {
  const approvalStub = () => ({
    approveWeek: jest.fn().mockResolvedValue(undefined),
    rejectWeek: jest.fn().mockResolvedValue(undefined),
  });

  it('auto-commits a session-day draft once now ≥ session start', async () => {
    const approval = approvalStub();
    const setStatus = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      [
        batch({
          kind: 'session_day',
          sessionStartUtc: '2026-06-28T06:00:00.000Z',
        }),
      ],
      approval,
      setStatus,
    );

    await svc.sweep('2026-06-28T07:00:00.000Z');

    expect(approval.approveWeek).toHaveBeenCalledWith('u1', 'p1', 3);
    expect(setStatus).toHaveBeenCalledWith('u1', 'b1', 'auto_committed');
    expect(approval.rejectWeek).not.toHaveBeenCalled();
  });

  it('expires a user-initiated draft past the inactivity window', async () => {
    const approval = approvalStub();
    const setStatus = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      [batch({ kind: 'user_initiated', createdAt: '2026-06-20T00:00:00.000Z' })],
      approval,
      setStatus,
    );

    await svc.sweep('2026-06-28T00:00:00.000Z');

    // user-initiated expire keeps the committed plan (rejectWeek with fallback=true).
    expect(approval.rejectWeek).toHaveBeenCalledWith('u1', 'p1', 3, true);
    expect(setStatus).toHaveBeenCalledWith('u1', 'b1', 'expired');
    expect(approval.approveWeek).not.toHaveBeenCalled();
  });

  it('leaves a still-live draft untouched (no status write)', async () => {
    const approval = approvalStub();
    const setStatus = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      [
        batch({
          kind: 'session_day',
          sessionStartUtc: '2026-06-28T18:00:00.000Z',
        }),
      ],
      approval,
      setStatus,
    );

    await svc.sweep('2026-06-28T07:00:00.000Z');

    expect(approval.approveWeek).not.toHaveBeenCalled();
    expect(approval.rejectWeek).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('isolates a failing batch so the rest still process', async () => {
    const approval = {
      approveWeek: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue(undefined),
      rejectWeek: jest.fn().mockResolvedValue(undefined),
    };
    const setStatus = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      [
        batch({
          id: 'bad',
          kind: 'session_day',
          sessionStartUtc: '2026-06-28T06:00:00.000Z',
        }),
        batch({
          id: 'good',
          kind: 'session_day',
          sessionStartUtc: '2026-06-28T06:00:00.000Z',
        }),
      ],
      approval,
      setStatus,
    );

    await svc.sweep('2026-06-28T07:00:00.000Z');

    // The first failed before its status write; the second still committed.
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith('u1', 'good', 'auto_committed');
  });

  it('does nothing when there are no pending batches', async () => {
    const approval = approvalStub();
    const setStatus = jest.fn();
    const svc = makeService([], approval, setStatus);

    await svc.sweep('2026-06-28T07:00:00.000Z');

    expect(setStatus).not.toHaveBeenCalled();
  });
});
