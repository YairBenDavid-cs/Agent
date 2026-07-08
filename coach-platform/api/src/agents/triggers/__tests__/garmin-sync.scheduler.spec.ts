import { GetGarminSyncScheduleQuery } from '../../../ingestion/garmin-sync-schedule/application/queries/get-garmin-sync-schedule.query';
import { GarminSyncSchedule } from '../../../ingestion/garmin-sync-schedule/domain/garmin-sync-schedule.model';
import { GetUserQuery } from '../../../users/application/queries/get-user.query';
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
      return null;
    }),
  };
  const orchestrator = { runForUser: jest.fn().mockResolvedValue(undefined) };
  const fetchTrigger = { runForUser: jest.fn().mockResolvedValue(undefined) };

  const scheduler = new GarminSyncScheduler(
    users as never,
    schedules as never,
    queryBus as never,
    orchestrator as never,
    fetchTrigger as never,
  );
  return { scheduler, users, schedules, queryBus, orchestrator, fetchTrigger };
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
    );
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
