import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Two Redis-backed primitives the pipeline queue needs, both expressed as a
 * `SET key value NX EX ttl` (set-if-absent with expiry):
 *
 *  - `claim(runId)`   — idempotency: the FIRST caller for a runId wins; retries
 *                       and replays of the same run see `false` and skip the work
 *                       (no double-write). TTL long enough to outlive retries.
 *  - `acquireLock(k)` — a short-lived per-user mutex so two runs for the same
 *                       user serialize (single-flight) even across processes.
 *
 * Gracefully degrades: if Redis is unconfigured or unreachable, both primitives
 * fall back to in-process Maps. That keeps single-process dev/test fully correct
 * (the only thing lost is cross-process coordination, which needs a real Redis).
 * Mirrors `OpenAiClient`: lazy connect, never blocks app startup.
 */
@Injectable()
export class IdempotencyStore implements OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyStore.name);
  private redis: Redis | null = null;
  private redisDown = false;

  /** In-memory fallback: key -> epoch-ms expiry. */
  private readonly memory = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Atomically claim a key. Returns true if this caller set it (first time),
   * false if it already existed (duplicate/replay).
   */
  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    return this.setNx(`claim:${key}`, ttlSeconds);
  }

  /** Acquire a short-lived mutex. Returns true if acquired. */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    return this.setNx(`lock:${key}`, ttlSeconds);
  }

  /** Release a mutex (best-effort; the TTL is the safety net). */
  async releaseLock(key: string): Promise<void> {
    await this.del(`lock:${key}`);
  }

  private async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const client = this.client();
    if (client) {
      try {
        const res = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch (err) {
        this.degrade(err);
      }
    }
    return this.memorySetNx(key, ttlSeconds);
  }

  private async del(key: string): Promise<void> {
    const client = this.client();
    if (client) {
      try {
        await client.del(key);
        return;
      } catch (err) {
        this.degrade(err);
      }
    }
    this.memory.delete(key);
  }

  private memorySetNx(key: string, ttlSeconds: number): boolean {
    const now = Date.now();
    const existing = this.memory.get(key);
    if (existing !== undefined && existing > now) {
      return false;
    }
    this.memory.set(key, now + ttlSeconds * 1000);
    return true;
  }

  private client(): Redis | null {
    if (this.redisDown) return null;
    if (this.redis) return this.redis;

    const url = this.config.get<string>('redisUrl');
    if (!url) {
      this.redisDown = true;
      return null;
    }
    try {
      this.redis = new Redis(url, {
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        // Don't let a missing Redis crash the process; degrade instead.
        retryStrategy: () => null,
      });
      this.redis.on('error', (err) => this.degrade(err));
      return this.redis;
    } catch (err) {
      this.degrade(err);
      return null;
    }
  }

  private degrade(err: unknown): void {
    if (!this.redisDown) {
      this.logger.warn(
        `Redis unavailable — falling back to in-process coordination: ${String(err)}`,
      );
    }
    this.redisDown = true;
    if (this.redis) {
      void this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }
}
