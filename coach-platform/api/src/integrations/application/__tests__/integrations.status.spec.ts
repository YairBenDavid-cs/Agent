import { IntegrationsService } from '../integrations.service';
import { UserIntegrationsRecord } from '../../domain/integrations.record';

/** The status projection must expose the Garmin sync state the connect step
 * polls — and only mark garmin `connected` against stored credentials. */
describe('IntegrationsService.getStatuses', () => {
  function build(record: UserIntegrationsRecord | null) {
    const repository = { find: jest.fn().mockResolvedValue(record) };
    const service = new IntegrationsService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return service;
  }

  it('surfaces garmin syncStatus / lastSyncedAt / lastError', async () => {
    const service = build({
      userId: 'u1',
      garmin: {
        email: 'e',
        passwordEnc: 'x',
        sessionEnc: null,
        sessionExpiresAt: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'sync_failed',
        lastSyncError: 'boom',
        lastSyncedAt: null,
      },
      googleCalendar: null,
      telegram: null,
    });

    const statuses = await service.getStatuses('u1');
    const garmin = statuses.find((s) => s.provider === 'garmin');
    expect(garmin).toMatchObject({
      connected: true,
      syncStatus: 'sync_failed',
      lastError: 'boom',
      lastSyncedAt: null,
    });
  });

  it('reports garmin disconnected with null sync fields when absent', async () => {
    const service = build(null);
    const garmin = (await service.getStatuses('u1')).find(
      (s) => s.provider === 'garmin',
    );
    expect(garmin).toMatchObject({ connected: false, syncStatus: null });
  });
});
