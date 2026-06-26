import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { UpsertSessionHandler } from './application/commands/upsert-session.handler';
import { FindSessionsHandler } from './application/queries/find-sessions.handler';
import { SESSIONS_REPOSITORY } from './domain/sessions.repository.port';
import { SessionsRepository } from './infrastructure/sessions.repository';
import {
  SessionSchema,
  WorkoutSessionDoc,
} from './infrastructure/session.schema';
import { SessionsController } from './interface/sessions.controller';

const CommandHandlers = [UpsertSessionHandler];
const QueryHandlers = [FindSessionsHandler];

@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([
      { name: WorkoutSessionDoc.name, schema: SessionSchema },
    ]),
  ],
  controllers: [SessionsController],
  providers: [
    { provide: SESSIONS_REPOSITORY, useClass: SessionsRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [SESSIONS_REPOSITORY],
})
export class SessionsModule {}
