import { ConfigService } from '@nestjs/config';
import { IdempotencyStore } from '../idempotency.store';

// No redisUrl → exercises the in-process fallback (deterministic, no I/O).
function noRedisConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

describe('IdempotencyStore (in-process fallback)', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore(noRedisConfig());
  });

  it('claims a key once; a second claim of the same key fails', async () => {
    expect(await store.claim('run-1', 60)).toBe(true);
    expect(await store.claim('run-1', 60)).toBe(false);
  });

  it('claims independent keys independently', async () => {
    expect(await store.claim('run-1', 60)).toBe(true);
    expect(await store.claim('run-2', 60)).toBe(true);
  });

  it('re-claims a key once its TTL has elapsed', async () => {
    expect(await store.claim('run-1', 1)).toBe(true);
    // Expire by 0 seconds — set TTL 0 means immediately expirable.
    await store.claim('run-x', 0);
    expect(await store.claim('run-x', 0)).toBe(true);
  });

  it('acquires a lock once and rejects a second holder until released', async () => {
    expect(await store.acquireLock('user:u1', 60)).toBe(true);
    expect(await store.acquireLock('user:u1', 60)).toBe(false);
    await store.releaseLock('user:u1');
    expect(await store.acquireLock('user:u1', 60)).toBe(true);
  });
});
