import { UpsertGarminSyncScheduleCommand } from '../upsert-garmin-sync-schedule.command';
import { UpsertGarminSyncScheduleHandler } from '../upsert-garmin-sync-schedule.handler';

function makeHandler() {
  const repository = {
    upsert: jest.fn().mockImplementation((input) =>
      Promise.resolve({
        ...input,
        lastFiredAt: {},
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      }),
    ),
  };
  const handler = new UpsertGarminSyncScheduleHandler(repository as never);
  return { handler, repository };
}

describe('UpsertGarminSyncScheduleHandler', () => {
  it('sorts + dedupes valid times and saves', async () => {
    const { handler, repository } = makeHandler();

    await handler.execute(
      new UpsertGarminSyncScheduleCommand(
        'u1',
        ['12:00', '04:00', '04:00'],
        'plan',
        true,
      ),
    );

    expect(repository.upsert).toHaveBeenCalledWith({
      userId: 'u1',
      syncTimesLocal: ['04:00', '12:00'],
      mode: 'plan',
      enabled: true,
    });
  });

  it('rejects zero sync times', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(new UpsertGarminSyncScheduleCommand('u1', [], 'plan', true)),
    ).rejects.toThrow('At least one sync time is required.');
  });

  it('rejects more than 3 sync times', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new UpsertGarminSyncScheduleCommand(
          'u1',
          ['04:00', '08:00', '12:00', '16:00'],
          'plan',
          true,
        ),
      ),
    ).rejects.toThrow('At most 3 sync times are allowed.');
  });

  it('rejects a malformed time string', async () => {
    const { handler } = makeHandler();

    await expect(
      handler.execute(
        new UpsertGarminSyncScheduleCommand('u1', ['4:00'], 'plan', true),
      ),
    ).rejects.toThrow('Sync times must be "HH:mm".');
  });
});
