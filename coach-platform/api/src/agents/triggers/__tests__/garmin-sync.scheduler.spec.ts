import { GetGarminSyncScheduleQuery } from '../../../ingestion/garmin-sync-schedule/application/queries/get-garmin-sync-schedule.query';
import { GarminSyncSchedule } from '../../../ingestion/garmin-sync-schedule/domain/garmin-sync-schedule.model';
import { GetUserQuery } from '../../../users/application/queries/get-user.query';
import { GetWeekQuery } from '../../../planned-sessions/application/queries/get-week.query';
import { GarminSyncScheduler } from '../garmin-sync.scheduler';

function schedule(overrides: Partial<GarminSyncSchedule> = {}): GarminSyncSchedule {
  return {
    userId: 'u1',
    syncTimesLocal: ['04:00'],
    mode: 'plan',
    enabled: true,
    lastFiredAt: {},
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeScheduler(opts: {
  userIds: string[];
  schedules: Record<string, GarminSyncSchedule>;
  timezone?: string;
  /** Committed planned week returned by GetWeekQuery (default: empty). */
  week?: unknown[];
  /** Observed activities in the week window (default: one unplanned run —
   *  a significant signal, so existing fire-path tests still reach fetch). */
  observed?: unknown[];
}) {
  const users = { findActiveIds: jest.fn().mockResolvedValue(opts.userIds) };
  const schedules = { markFired: jest.fn().mockResolvedValue(undefined) };
  const queryBus = {
    execute: jest.fn(async (q: unknown) => {
      if (q instanceof GetGarminSyncScheduleQuery) {
        return opts.schedules[q.userId];
      }
      if (q instanceof GetUserQuery) {
        return { timezone: opts.timezone ?? 'UTC' };
      }
      if (q instanceof GetWeekQuery) {
        return opts.week ?? [];
      }
      return null;
    }),
  };
  const orchestrator = { runForUser: jest.fn().mockResolvedValue(undefined) };
  const fetchTrigger = { runForUser: jest.fn().mockResolvedValue(undefined) };
  const matcher = {
    reconcile: jest
      .fn()
      .mockResolvedValue({ userId: 'u1', sessionsScanned: 0, matched: 0 }),
  };
  const resolver = {
    resolveForToday: jest.fn().mockResolvedValue({
      programId: 'p1',
      discipline: 'running',
      timezone: opts.timezone ?? 'UTC',
      weekIndex: 1,
      weekWindow: { from: '2026-07-06', to: '2026-07-12' },
    }),
  };
  const sessions = {
    findRange: jest
      .fn()
      .mockResolvedValue(
        opts.observed ?? [{ activityId: 99, date: '2026-07-07', type: 'running' }],
      ),
  };

  const scheduler = new GarminSyncScheduler(
    users as never,
    schedules as never,
    sessions as never,
    queryBus as never,
    orchestrator as never,
    matcher as never,
    resolver as never,
    fetchTrigger as never,
  );
  return {
    scheduler,
    users,
    schedules,
    queryBus,
    orchestrator,
    fetchTrigger,
    matcher,
    resolver,
    sessions,
  };
}

describe('GarminSyncScheduler.sweep', () => {
  it('fires the ingestion + fetch trigger when the local clock matches a due, unfired slot', async () => {
    const { scheduler, schedules, orchestrator, fetchTrigger } = makeScheduler({
      userIds: ['u1'],
      schedules: { u1: schedule({ syncTimesLocal: ['04:00'] }) },
    });

    await scheduler.sweep(new Date('2026-07-08T04:00:00.000Z'));

    expect(schedules.markFired).toHaveBeenCalledWith('u1', '04:00', '2026-07-08');
    expect(orchestrator.runForUser).toHaveBeenCalledWith('u1');
    expect(fetchTrigger.runForUser).toHaveBeenCalledWith(
      'u1',
      '2026-07-08',
      'garmin-sync:u1:2026-07-08:04:00',
      'Unplanned running activity on 2026-07-07 — extra load on top of the plan.',
    );
  });

  it('reconciles matches BEFORE enqueueing the replan', async () => {
    const { scheduler, matcher, fetchTrigger } = makeScheduler({
      userIds: ['u1'],
      schedules: { u1: schedule({ syncTimesLocal: ['04:00'] }) },
    });
    const order: string[] = [];
    matcher.reconcile.mockImplementation(async () => {
      order.push('reconcile');
      return { userId: 'u1', sessionsScanned: 0, matched: 0 };
    });
    fetchTrigger.runForUser.mockImplementation(async () => {
      order.push('fetch');
      return null;
    });

    await scheduler.sweep(new Date('2026-07-08T04:00:00.000Z'));

    expect(matcher.reconcile).toHaveBeenCalledWith('u1', '2026-07-06', '2026-07-12');
    expect(order).toEqual(['reconcile', 'fetch']);
  });

  it('stays silent (no replan) when the sync produced no significant signal', async () => {
    const { scheduler, matcher, fetchTrigger } = makeScheduler({
      userIds: ['u1'],
      schedules: { u1: schedule({ syncTimesLocal: ['04:00'] }) },
      week: [],
      observed: [],
    });

    await scheduler.sweep(new Date('2026-07-08T04:00:00.000Z'));

    expect(matcher.reconcile).toHaveBeenCalled();
    expect(fetchTrigger.runForUser).not.toHaveBeenCalled();
  });

  it('does not fire when the schedule is disabled', async () => {
    const { scheduler, orchestrator, fetchTrigger } = makeScheduler({
      userIds: ['u1'],
      schedules: { u1: schedule({ enabled: false }) },
    });

    await scheduler.sweep(new Date('2026-07-08T04:00:00.000Z'));

    expect(orchestrator.runForUser).not.toHaveBeenCalled();
    expect(fetchTrigger.runForUser).not.toHaveBeenCalled();
  });

  it('does not fire when the current local time does not match any configured slot', async () => {
    const { scheduler, orchestrator } = makeScheduler({
      userIds: ['u1'],
      schedules: { u1: schedule({ syncTimesLocal: ['04:00'] }) },
    });

    await scheduler.sweep(new Date('2026-07-08T04:01:00.000Z'));

    expect(orchestrator.runForUser).not.toHaveBeenCalled();
  });

  it('does not fire twice for the same slot on the same local date', async () => {
    const { scheduler, orchestrator } = makeScheduler({
      userIds: ['u1'],
      schedules: {
        u1: schedule({
          syncTimesLocal: ['04:00'],
          lastFiredAt: { '04:00': '2026-07-08' },
        }),
      },
    });

    await scheduler.sweep(new Date('2026-07-08T04:00:00.000Z'));

    expect(orchestrator.runForUser).not.toHaveBeenCalled();
  });

  it('respects the user timezone when computing local clock/date', async () => {
    const { scheduler, orchestrator } = makeScheduler({
      userIds: ['u1'],
      schedules: { u1: schedule({ syncTimesLocal: ['22:00'] }) },
      timezone: 'America/New_York',
    });

    // 2026-07-08T02:00:00Z is 2026-07-07T22:00:00 in America/New_York (EDT, UTC-4).
    await scheduler.sweep(new Date('2026-07-08T02:00:00.000Z'));

    expect(orchestrator.runForUser).toHaveBeenCalledWith('u1');
  });

  it('isolates a per-user failure so the sweep continues for other users', async () => {
    const { scheduler, orchestrator } = makeScheduler({
      userIds: ['bad', 'good'],
      schedules: {
        bad: schedule(),
        good: schedule(),
      },
    });
    orchestrator.runForUser.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await scheduler.sweep(new Date('2026-07-08T04:00:00.000Z'));

    expect(orchestrator.runForUser).toHaveBeenCalledWith('good');
  });
});
