import { Global, Module } from '@nestjs/common';
import { TransactionManager } from './transaction.manager';

/**
 * Global so any context can wrap multi-write flows in a transaction without
 * re-importing. Relies on the default Mongoose connection from DatabaseModule.
 */
@Global()
@Module({
  providers: [TransactionManager],
  exports: [TransactionManager],
})
export class TransactionModule {}
