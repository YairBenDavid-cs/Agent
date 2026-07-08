import { AUTO_MODE_LOCK_TTL_MS, AutoModeLockService } from '../auto-mode-lock.service';
import { AutoModeRun } from '../domain/auto-mode-run.model';

const NOW = '2026-07-08T12:00:00.000Z';

function setup() {
  const programs = {
    setWeekRunLock: jest.fn(() => Promise.resolve(true)),
  };
  const runs = {
    findStaleRunning: jest.fn(() => Promise.resolve<AutoModeRun[]>([])),
    markFailed: jest.fn(() => Promise.resolve()),
  };
  const service = new AutoModeLockService(programs as never, runs as never);
  return { service, programs, runs };
}

function staleRun(overrides: Partial<AutoModeRun> = {}): AutoModeRun {
  return {
    id: 'run-1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    scenario: 'new_week',
    trigger: 'chat',
    conversationId: 'c1',
    status: 'running',
    trace: [],
    beforeSnapshot: null,
    diff: null,
    failureReason: null,
    createdAt: NOW,
    startedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

describe('AutoModeLockService', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date(NOW));
  });
  afterAll(() => jest.useRealTimers());

  describe('acquire', () => {
    it('delegates to setWeekRunLock with the run lock payload and returns the result', async () => {
      const { service, programs } = setup();
      const result = await service.acquire('u1', 'p1', 2, 'run-1');

      expect(programs.setWeekRunLock).toHaveBeenCalledWith('u1', 'p1', 2, {
        runId: 'run-1',
        lockedAt: NOW,
      });
      expect(result).toBe(true);
    });

    it('returns false when setWeekRunLock reports the lock is held elsewhere', async () => {
      const { service, programs } = setup();
      programs.setWeekRunLock.mockResolvedValueOnce(false);

      expect(await service.acquire('u1', 'p1', 2, 'run-1')).toBe(false);
    });
  });

  describe('heartbeat', () => {
    it('re-stamps lockedAt and passes runId as the "only if still holder" guard', async () => {
      const { service, programs } = setup();
      await service.heartbeat('u1', 'p1', 2, 'run-1');

      expect(programs.setWeekRunLock).toHaveBeenCalledWith(
        'u1',
        'p1',
        2,
        { runId: 'run-1', lockedAt: NOW },
        'run-1',
      );
    });
  });

  describe('release', () => {
    it('passes a null lock and runId as the expected-holder guard', async () => {
      const { service, programs } = setup();
      await service.release('u1', 'p1', 2, 'run-1');

      expect(programs.setWeekRunLock).toHaveBeenCalledWith('u1', 'p1', 2, null, 'run-1');
    });
  });

  describe('reapStale', () => {
    it('queries findStaleRunning with the TTL and limit, releases + fails each stale run, and returns the count', async () => {
      const { service, programs, runs } = setup();
      const run1 = staleRun({ id: 'run-1', userId: 'u1', programId: 'p1', weekIndex: 2 });
      const run2 = staleRun({ id: 'run-2', userId: 'u2', programId: 'p2', weekIndex: 5 });
      runs.findStaleRunning.mockResolvedValueOnce([run1, run2]);

      const count = await service.reapStale(10);

      expect(runs.findStaleRunning).toHaveBeenCalledWith(AUTO_MODE_LOCK_TTL_MS, 10);
      expect(programs.setWeekRunLock).toHaveBeenNthCalledWith(1, 'u1', 'p1', 2, null, 'run-1');
      expect(programs.setWeekRunLock).toHaveBeenNthCalledWith(2, 'u2', 'p2', 5, null, 'run-2');
      expect(runs.markFailed).toHaveBeenNthCalledWith(
        1,
        'run-1',
        'Reaped: run exceeded the lock TTL without completing.',
      );
      expect(runs.markFailed).toHaveBeenNthCalledWith(
        2,
        'run-2',
        'Reaped: run exceeded the lock TTL without completing.',
      );
      expect(count).toBe(2);
    });

    it('defaults to a limit of 50 and returns 0 when nothing is stale', async () => {
      const { service, runs } = setup();

      const count = await service.reapStale();

      expect(runs.findStaleRunning).toHaveBeenCalledWith(AUTO_MODE_LOCK_TTL_MS, 50);
      expect(count).toBe(0);
    });
  });
});
