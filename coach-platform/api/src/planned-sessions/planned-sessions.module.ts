import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { CommitSessionHandler } from './application/commands/commit-session.handler';
import { CommitWeekHandler } from './application/commands/commit-week.handler';
import { DiscardTentativeWeekHandler } from './application/commands/discard-tentative-week.handler';
import { RecordOutcomeHandler } from './application/commands/record-outcome.handler';
import { UpdateCalendarSyncHandler } from './application/commands/update-calendar-sync.handler';
import { UpsertSessionScheduleHandler } from './application/commands/upsert-session-schedule.handler';
import { UpsertWeekSessionsHandler } from './application/commands/upsert-week-sessions.handler';
import { GetCalendarRangeHandler } from './application/queries/get-calendar-range.handler';
import { GetWeekHandler } from './application/queries/get-week.handler';
import { PLANNED_SESSION_REPOSITORY } from './domain/planned-session.repository.port';
import { PlannedSessionRepository } from './infrastructure/planned-session.repository';
import {
  PlannedSessionDoc,
  PlannedSessionSchema,
} from './infrastructure/planned-session.schema';
import { PlannedSessionsController } from './interface/planned-sessions.controller';

const CommandHandlers = [
  RecordOutcomeHandler,
  UpsertWeekSessionsHandler,
  UpsertSessionScheduleHandler,
  CommitWeekHandler,
  CommitSessionHandler,
  UpdateCalendarSyncHandler,
  DiscardTentativeWeekHandler,
];
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
