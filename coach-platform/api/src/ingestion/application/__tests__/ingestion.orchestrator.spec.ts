import { ServiceUnavailableException } from '@nestjs/common';
import { IngestionOrchestrator } from '../ingestion.orchestrator';
import { GarminAuthError } from '../ingestion.errors';
import { FetchResultDto } from '../dto/fetch-result.dto';

/**
 * The orchestrator's contract with the connect-step UX: every run records its
 * outcome on the Garmin connection so the frontend can watch it reach `synced`
 * or surface the right kind of failure.
 */
describe('IngestionOrchestrator sync-status transitions', () => {
  const auth = { credentials: { email: 'e', password: 'p' }, session: null };

  function build(fetchImpl: () => Promise<FetchResultDto>) {
    const setGarminSyncStatus = jest.fn().mockResolvedValue(undefined);
    const integrations = {
      getDecryptedGarminAuth: jest
        .fn()
        .mockResolvedValue({ ...auth, credentials: { ...auth.credentials } }),
      saveGarminSession: jest.fn().mockResolvedValue(undefined),
      setGarminSyncStatus,
    };
    const fetcher = { fetch: jest.fn(fetchImpl) };
    const commandBus = { execute: jest.fn().mockResolvedValue({ written: false }) };
    const events = { emit: jest.fn() };
    const config = { get: jest.fn().mockReturnValue(7) };

    const orchestrator = new IngestionOrchestrator(
      fetcher as never,
      integrations as never,
      commandBus as never,
      events as never,
      config as never,
    );
    return { orchestrator, setGarminSyncStatus, events, fetcher, integrations };
  }

  it('marks syncing then synced on a clean run, even with zero rows', async () => {
    const { orchestrator, setGarminSyncStatus, events } = build(async () => ({
      session: null,
      days: [],
    }));

    await orchestrator.runForUser('u1');

    expect(setGarminSyncStatus.mock.calls[0]).toEqual(['u1', 'syncing']);
    const last = setGarminSyncStatus.mock.calls.at(-1);
    expect(last?.[0]).toBe('u1');
    expect(last?.[1]).toBe('synced');
    expect(last?.[2]).toMatchObject({ error: null });
    expect(typeof last?.[2].syncedAt).toBe('string');
    expect(events.emit).toHaveBeenCalledTimes(1); // INGESTION_COMPLETED
  });

  it('fetches a wide range in chunks and reuses the refreshed session', async () => {
    const session = { token: 't1', expiresAt: '2027-01-01T00:00:00.000Z' };
    const { orchestrator, fetcher, integrations, setGarminSyncStatus } = build(
      async () => ({ session, days: [] }),
    );

    // chunk size mocked to 7 (config.get returns 7) → 30 days = 5 chunks.
    await orchestrator.runForUser('u1', { from: '2026-06-09', to: '2026-07-08' });

    const fetchCalls = fetcher.fetch.mock.calls as unknown as Array<
      [{ from: string; to: string; auth: { session: unknown } }]
    >;
    const calls = fetchCalls.map(([input]) => ({
      from: input.from,
      to: input.to,
    }));
    expect(calls).toEqual([
      { from: '2026-06-09', to: '2026-06-15' },
      { from: '2026-06-16', to: '2026-06-22' },
      { from: '2026-06-23', to: '2026-06-29' },
      { from: '2026-06-30', to: '2026-07-06' },
      { from: '2026-07-07', to: '2026-07-08' }, // final partial chunk
    ]);
    // The session minted by the first chunk is cached and reused afterwards.
    expect(integrations.saveGarminSession).toHaveBeenCalledTimes(5);
    expect(fetchCalls[1][0].auth.session).toBe(session);
    expect(setGarminSyncStatus.mock.calls.at(-1)?.[1]).toBe('synced');
  });

  it('marks auth_failed and rethrows when the fetch is rejected for auth', async () => {
    const { orchestrator, setGarminSyncStatus, events } = build(async () => {
      throw new GarminAuthError('rejected');
    });

    await expect(orchestrator.runForUser('u1')).rejects.toBeInstanceOf(
      GarminAuthError,
    );
    expect(setGarminSyncStatus.mock.calls.at(-1)?.[1]).toBe('auth_failed');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('marks sync_failed and rethrows on a transient/fetch failure', async () => {
    const { orchestrator, setGarminSyncStatus } = build(async () => {
      throw new ServiceUnavailableException('fetch service down');
    });

    await expect(orchestrator.runForUser('u1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(setGarminSyncStatus.mock.calls.at(-1)?.[1]).toBe('sync_failed');
  });
});
