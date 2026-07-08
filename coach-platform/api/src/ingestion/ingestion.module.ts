import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
import { GARMIN_FETCHER } from './application/fetcher.port';
import { GarminConnectedListener } from './application/garmin-connected.listener';
import { IngestionOrchestrator } from './application/ingestion.orchestrator';
import { GarminFetcherClient } from './infrastructure/garmin-fetcher.client';
import { IngestionController } from './interface/ingestion.controller';
import { GARMIN_SYNC_SCHEDULE_REPOSITORY } from './garmin-sync-schedule/domain/garmin-sync-schedule.repository.port';
import { GarminSyncScheduleRepository } from './garmin-sync-schedule/infrastructure/garmin-sync-schedule.repository';
import {
  GarminSyncScheduleDoc,
  GarminSyncScheduleSchema,
} from './garmin-sync-schedule/infrastructure/garmin-sync-schedule.schema';
import { GetGarminSyncScheduleHandler } from './garmin-sync-schedule/application/queries/get-garmin-sync-schedule.handler';
import { UpsertGarminSyncScheduleHandler } from './garmin-sync-schedule/application/commands/upsert-garmin-sync-schedule.handler';
import { GarminSyncScheduleController } from './garmin-sync-schedule/interface/garmin-sync-schedule.controller';

/**
 * Orchestration context. Imports the contexts it coordinates only for what they
 * EXPOSE: the command/query buses (CqrsModule), the Integrations capability, and
 * the Users tenant directory. It never reaches into their repositories directly.
 *
 * Exports `IngestionOrchestrator` so the agent layer's scheduled sync sweep
 * (`agents/triggers/garmin-sync.scheduler.ts`) can run a fetch for a user
 * before enqueueing the pipeline that reacts to it. Also exports the Garmin
 * sync schedule repository so that same sweep can read a user's configured
 * sync times/mode without this module reaching into the agent layer.
 */
@Module({
  imports: [
    CqrsModule,
    IntegrationsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: GarminSyncScheduleDoc.name, schema: GarminSyncScheduleSchema },
    ]),
  ],
  controllers: [IngestionController, GarminSyncScheduleController],
  providers: [
    IngestionOrchestrator,
    GarminConnectedListener,
    { provide: GARMIN_FETCHER, useClass: GarminFetcherClient },
    { provide: GARMIN_SYNC_SCHEDULE_REPOSITORY, useClass: GarminSyncScheduleRepository },
    GetGarminSyncScheduleHandler,
    UpsertGarminSyncScheduleHandler,
  ],
  exports: [IngestionOrchestrator, GARMIN_SYNC_SCHEDULE_REPOSITORY],
})
export class IngestionModule {}
