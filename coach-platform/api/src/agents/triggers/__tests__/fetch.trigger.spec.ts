import { Pipeline } from '../../orchestrator/pipeline.types';
import { FetchTrigger } from '../fetch.trigger';

const TODAY_WEEK_CTX = {
  programId: 'prog-1',
  discipline: 'running',
  timezone: 'UTC',
  weekIndex: 1,
  weekWindow: { from: '2026-06-15', to: '2026-06-21' },
};

function makeTrigger(ctx: unknown) {
  const resolver = {
    resolve: jest.fn(),
    resolveForToday: jest.fn().mockResolvedValue(ctx),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue({ stages: [] }) };
  const trigger = new FetchTrigger(resolver as never, queue as never);
  return { trigger, resolver, queue };
}

describe('FetchTrigger', () => {
  it('resolves the week by date (resolveForToday), never the build pointer', async () => {
    // Regression: a scheduled build can advance `currentWeekIndex` onto next
    // week before its startDate arrives; the session-day pipeline must still
    // target the week containing today.
    const { trigger, resolver, queue } = makeTrigger(TODAY_WEEK_CTX);

    await trigger.runForUser('user-1', '2026-06-16');

    expect(resolver.resolveForToday).toHaveBeenCalledWith('user-1');
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith({
      pipeline: Pipeline.FULL_SESSION_DAY,
      ctx: expect.objectContaining({
        userId: 'user-1',
        runId: 'fetch:user-1:2026-06-16',
        weekIndex: 1,
        weekWindow: { from: '2026-06-15', to: '2026-06-21' },
      }),
    });
  });

  it('no-ops when no context resolves', async () => {
    const { trigger, queue } = makeTrigger(null);

    expect(await trigger.runForUser('user-1', '2026-06-16')).toBeNull();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
