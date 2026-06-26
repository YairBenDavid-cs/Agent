import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { RecordOutcomeHandler } from './application/commands/record-outcome.handler';
import { GetCalendarRangeHandler } from './application/queries/get-calendar-range.handler';
import { GetWeekHandler } from './application/queries/get-week.handler';
import { PLANNED_SESSION_REPOSITORY } from './domain/planned-session.repository.port';
import { PlannedSessionRepository } from './infrastructure/planned-session.repository';
import {
  PlannedSessionDoc,
  PlannedSessionSchema,
} from './infrastructure/planned-session.schema';
import { PlannedSessionsController } from './interface/planned-sessions.controller';

const CommandHandlers = [RecordOutcomeHandler];
const QueryHandlers = [GetCalendarRangeHandler, GetWeekHandler];

@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([
      { name: PlannedSessionDoc.name, schema: PlannedSessionSchema },
    ]),
  ],
  controllers: [PlannedSessionsController],
  providers: [
    {
      provide: PLANNED_SESSION_REPOSITORY,
      useClass: PlannedSessionRepository,
    },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [PLANNED_SESSION_REPOSITORY],
})
export class PlannedSessionsModule {}
