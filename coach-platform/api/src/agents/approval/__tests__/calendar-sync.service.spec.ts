import { CalendarSyncService, SyncableSession } from '../calendar-sync.service';

const session = (overrides: Partial<SyncableSession> = {}): SyncableSession => ({
  id: 'sess-1',
  title: 'Easy run',
  running: null,
  strength: null,
  scheduledStartUtc: '2026-06-22T05:00:00.000Z',
  estDurationMin: 45,
  timezone: 'UTC',
  calendarSync: null,
  ...overrides,
});

function makeService(calendar: {
  insertEvent?: jest.Mock;
  updateEvent?: jest.Mock;
}) {
  const commands: unknown[] = [];
  const commandBus = {
    execute: (cmd: unknown) => {
      commands.push(cmd);
      return Promise.resolve({ updated: true });
    },
  };
  const calendarClient = {
    insertEvent: calendar.insertEvent ?? jest.fn(),
    updateEvent: calendar.updateEvent ?? jest.fn(),
    listEvents: jest.fn(),
    deleteEvent: jest.fn(),
  };
  const service = new CalendarSyncService(
    calendarClient as never,
    commandBus as never,
  );
  return { service, commands, calendarClient };
}

describe('CalendarSyncService.syncWeek', () => {
  it('inserts a new event when there is no existing eventId', async () => {
    const insertEvent = jest.fn().mockResolvedValue({ eventId: 'g-1' });
    const { service, commands } = makeService({ insertEvent });

    const res = await service.syncWeek('user-1', [session()]);

    expect(insertEvent).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ synced: 1, failed: 0 });
    expect(commands).toHaveLength(1);
    expect((commands[0] as { calendarSync: { eventId: string; syncState: string } }).calendarSync)
      .toMatchObject({ eventId: 'g-1', syncState: 'synced' });
  });

  it('updates the existing event when an eventId is already present', async () => {
    const updateEvent = jest.fn().mockResolvedValue(undefined);
    const insertEvent = jest.fn();
    const { service } = makeService({ updateEvent, insertEvent });

    const res = await service.syncWeek('user-1', [
      session({
        calendarSync: {
          provider: 'google',
          eventId: 'g-existing',
          syncedAt: '2026-06-01T00:00:00.000Z',
          syncState: 'synced',
        },
      }),
    ]);

    expect(updateEvent).toHaveBeenCalledWith('user-1', 'g-existing', expect.anything());
    expect(insertEvent).not.toHaveBeenCalled();
    expect(res).toEqual({ synced: 1, failed: 0 });
  });

  it('isolates a per-session failure and marks it failed without aborting the batch', async () => {
    const insertEvent = jest
      .fn()
      .mockRejectedValueOnce(new Error('google 500'))
      .mockResolvedValueOnce({ eventId: 'g-2' });
    const { service, commands } = makeService({ insertEvent });

    const res = await service.syncWeek('user-1', [
      session({ id: 'a' }),
      session({ id: 'b' }),
    ]);

    expect(res).toEqual({ synced: 1, failed: 1 });
    const states = commands.map(
      (c) => (c as { calendarSync: { syncState: string } }).calendarSync.syncState,
    );
    expect(states).toEqual(['failed', 'synced']);
  });
});
