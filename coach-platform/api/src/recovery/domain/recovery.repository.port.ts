import { RecoveryDay } from './recovery-day.model';

/** DI token for the recovery repository port (DIP: depend on the abstraction). */
export const RECOVERY_REPOSITORY = Symbol('RECOVERY_REPOSITORY');

/**
 * Domain-facing persistence contract. Speaks recovery language, not storage.
 * Every method is tenant-scoped by userId and async.
 */
export interface RecoveryRepositoryPort {
  /** Idempotent upsert keyed on (userId, date). */
  upsertDay(day: RecoveryDay): Promise<void>;

  /** Latest stored content hash for a day, or null if absent (idempotency check). */
  getContentHash(userId: string, date: string): Promise<string | null>;

  /** Inclusive date range, ascending by date, optionally cursor-paginated. */
  findRange(
    userId: string,
    from: string,
    to: string,
    afterDate: string | null,
    limit: number,
  ): Promise<RecoveryDay[]>;
}
