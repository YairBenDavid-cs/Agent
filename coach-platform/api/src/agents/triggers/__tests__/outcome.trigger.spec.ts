import { OutcomeRecordedEvent } from '../../../planned-sessions/application/events/outcome-recorded.event';
import { Pipeline } from '../../orchestrator/pipeline.types';
import { OUTCOME_CLARIFY_NEEDED, OutcomeTrigger } from '../outcome.trigger';

const TODAY_WEEK_CTX = {
  programId: 'prog-1',
  discipline: 'running',
  timezone: 'UTC',
  weekIndex: 1,
  weekWindow: { from: '2026-06-15', to: '2026-06-21' },
};

function makeEvent(overrides: Partial<OutcomeRecordedEvent['payload']> = {}) {
  return new OutcomeRecordedEvent({
    userId: 'user-1',
    plannedSessionId: 'ps-1',
    discipline: 'running',
    reasonCode: 'injury_or_illness',
    status: 'skipped',
    scheduledDate: '2026-06-16',
    startTime: '07:00',
    endTime: '08:00',
    ...overrides,
  });
}

function makeTrigger(ctx: unknown) {
  const resolver = {
    resolve: jest.fn(),
    resolveForToday: jest.fn().mockResolvedValue(ctx),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue({ stages: [] }) };
  const events = { emit: jest.fn() };
  const trigger = new OutcomeTrigger(
    resolver as never,
    queue as never,
    events as never,
  );
  return { trigger, resolver, queue, events };
}

describe('OutcomeTrigger', () => {
  it('fires SAFETY_REPLAN against the week containing today, not the build pointer', async () => {
    // Regression: an injury reported while `currentWeekIndex` already points
    // at an early-built next week must replan the athlete's ACTUAL week.
    const { trigger, resolver, queue } = makeTrigger(TODAY_WEEK_CTX);

    await trigger.handle(makeEvent());

    expect(resolver.resolveForToday).toHaveBeenCalledWith('user-1');
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith({
      pipeline: Pipeline.SAFETY_REPLAN,
      ctx: expect.objectContaining({
        runId: 'outcome-safety:ps-1',
        weekIndex: 1,
        weekWindow: { from: '2026-06-15', to: '2026-06-21' },
      }),
    });
  });

  it('no-ops the safety path when no context resolves', async () => {
    const { trigger, queue } = makeTrigger(null);

    await trigger.handle(makeEvent());

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('emits the clarify seam for non-safety negative outcomes without resolving context', async () => {
    const { trigger, resolver, queue, events } = makeTrigger(TODAY_WEEK_CTX);

    await trigger.handle(makeEvent({ reasonCode: 'too_hard', status: 'deviated' }));

    expect(events.emit).toHaveBeenCalledWith(
      OUTCOME_CLARIFY_NEEDED,
      expect.objectContaining({
        payload: expect.objectContaining({ plannedSessionId: 'ps-1' }),
      }),
    );
    expect(resolver.resolveForToday).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
