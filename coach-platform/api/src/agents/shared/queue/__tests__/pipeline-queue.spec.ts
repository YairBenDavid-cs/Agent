import { ConfigService } from '@nestjs/config';
import { OrchestratorSaga } from '../../../orchestrator/orchestrator.saga';
import {
  Pipeline,
  PipelineRunContext,
  PipelineRunResult,
} from '../../../orchestrator/pipeline.types';
import { IdempotencyStore } from '../idempotency.store';
import { PipelineJob, PipelineQueue } from '../pipeline-queue.service';

// A ConfigService with no redisUrl forces the in-process fallback path, which
// is the deterministic, single-process behaviour we assert here.
function noRedisConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

function ctx(overrides: Partial<PipelineRunContext> = {}): PipelineRunContext {
  return {
    userId: 'u1',
    runId: 'run-1',
    discipline: 'running',
    timezone: 'UTC',
    weekWindow: { from: '2026-07-06', to: '2026-07-12' },
    ...overrides,
  } as PipelineRunContext;
}

function job(overrides: Partial<PipelineRunContext> = {}): PipelineJob {
  return { pipeline: Pipeline.CONTENT_REPLAN, ctx: ctx(overrides) };
}

// Flush all pending microtasks (the queue awaits claim+lock before saga.run).
const tick = () => new Promise<void>((res) => setTimeout(res, 0));

function result(): PipelineRunResult {
  return {
    pipeline: Pipeline.CONTENT_REPLAN,
    status: 'completed',
    stages: [],
    recoveryVerdict: null,
    placement: null,
  };
}

describe('PipelineQueue', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore(noRedisConfig());
  });

  it('runs a fresh job through the saga and returns its result', async () => {
    const saga = { run: jest.fn().mockResolvedValue(result()) };
    const queue = new PipelineQueue(
      saga as unknown as OrchestratorSaga,
      store,
    );

    const out = await queue.enqueue(job());

    expect(saga.run).toHaveBeenCalledTimes(1);
    expect(out?.status).toBe('completed');
  });

  it('skips a duplicate runId (idempotency) without re-running the saga', async () => {
    const saga = { run: jest.fn().mockResolvedValue(result()) };
    const queue = new PipelineQueue(
      saga as unknown as OrchestratorSaga,
      store,
    );

    const first = await queue.enqueue(job());
    const second = await queue.enqueue(job()); // same runId

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(saga.run).toHaveBeenCalledTimes(1);
  });

  it('serializes two runs for the same user (concurrency = 1)', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((res) => (releaseFirst = res));

    const saga = {
      run: jest
        .fn()
        .mockImplementationOnce(async () => {
          order.push('start-a');
          await firstGate;
          order.push('end-a');
          return result();
        })
        .mockImplementationOnce(async () => {
          order.push('start-b');
          order.push('end-b');
          return result();
        }),
    };
    const queue = new PipelineQueue(
      saga as unknown as OrchestratorSaga,
      store,
    );

    const a = queue.enqueue(job({ runId: 'a' }));
    const b = queue.enqueue(job({ runId: 'b' }));

    // B must not start until A has fully finished.
    await tick();
    expect(order).toEqual(['start-a']);
    releaseFirst();
    await Promise.all([a, b]);

    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
  });

  it('runs different users concurrently (no cross-user blocking)', async () => {
    const order: string[] = [];
    let releaseU1!: () => void;
    const u1Gate = new Promise<void>((res) => (releaseU1 = res));

    const saga = {
      run: jest
        .fn()
        .mockImplementationOnce(async () => {
          order.push('start-u1');
          await u1Gate;
          return result();
        })
        .mockImplementationOnce(async () => {
          order.push('start-u2');
          return result();
        }),
    };
    const queue = new PipelineQueue(
      saga as unknown as OrchestratorSaga,
      store,
    );

    const p1 = queue.enqueue(job({ userId: 'u1', runId: 'a' }));
    const p2 = queue.enqueue(job({ userId: 'u2', runId: 'b' }));

    await tick();
    // u2 starts even though u1 is still blocked.
    expect(order).toContain('start-u2');
    releaseU1();
    await Promise.all([p1, p2]);
  });

  it('flags the earlier run superseded when a newer run for the same week is enqueued', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((res) => (releaseFirst = res));

    const saga = {
      run: jest
        .fn()
        .mockImplementationOnce(async () => {
          await firstGate;
          return result();
        })
        .mockImplementationOnce(async () => result()),
    };
    const queue = new PipelineQueue(
      saga as unknown as OrchestratorSaga,
      store,
    );

    const a = queue.enqueue(job({ runId: 'a' })); // same user+week
    const b = queue.enqueue(job({ runId: 'b' })); // supersedes a

    releaseFirst();
    const [resA, resB] = await Promise.all([a, b]);

    expect(resA?.superseded).toBe(true);
    expect(resB?.superseded).toBeFalsy();
  });

  it('isLatest reflects the most recently enqueued run for a user+week', async () => {
    const saga = { run: jest.fn().mockResolvedValue(result()) };
    const queue = new PipelineQueue(
      saga as unknown as OrchestratorSaga,
      store,
    );

    await queue.enqueue(job({ runId: 'a' }));
    await queue.enqueue(job({ runId: 'b' }));

    expect(queue.isLatest(ctx({ runId: 'b' }))).toBe(true);
    expect(queue.isLatest(ctx({ runId: 'a' }))).toBe(false);
  });
});
