import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { transactionStorage } from './transaction.context';

/**
 * Runs a unit of work inside a single MongoDB transaction. The session is made
 * ambient via AsyncLocalStorage so every repository call made within `work`
 * automatically enrolls in the same transaction.
 *
 * Requires Mongo to run as a replica set (single-node rs is fine in dev).
 * Note: withTransaction may re-run `work` on transient errors, so `work` must be
 * safe to retry (our register/login flows are).
 */
@Injectable()
export class TransactionManager {
  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await transactionStorage.run({ session }, work);
      });
      // result is always assigned: withTransaction throws if work throws.
      return result!;
    } finally {
      await session.endSession();
    }
  }
}
