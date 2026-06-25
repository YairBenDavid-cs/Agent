import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { UpsertRecoveryDayHandler } from './application/commands/upsert-recovery-day.handler';
import { GetRecoveryRangeHandler } from './application/queries/get-recovery-range.handler';
import { RECOVERY_REPOSITORY } from './domain/recovery.repository.port';
import { RecoveryRepository } from './infrastructure/recovery.repository';
import {
  RecoveryDaily,
  RecoveryDailySchema,
} from './infrastructure/recovery-daily.schema';
import { RecoveryController } from './interface/recovery.controller';

const CommandHandlers = [UpsertRecoveryDayHandler];
const QueryHandlers = [GetRecoveryRangeHandler];

@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([
      { name: RecoveryDaily.name, schema: RecoveryDailySchema },
    ]),
  ],
  controllers: [RecoveryController],
  providers: [
    { provide: RECOVERY_REPOSITORY, useClass: RecoveryRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  // Published contract: command/query handlers are reachable via the buses;
  // exporting CqrsModule is unnecessary. Nothing internal leaks.
})
export class RecoveryModule {}
