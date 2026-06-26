import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IntegrationsModule } from '../integrations/integrations.module';
import { UsersModule } from '../users/users.module';
import { GARMIN_FETCHER } from './application/fetcher.port';
import { GarminConnectedListener } from './application/garmin-connected.listener';
import { IngestionOrchestrator } from './application/ingestion.orchestrator';
import { GarminFetcherClient } from './infrastructure/garmin-fetcher.client';
import { IngestionScheduler } from './infrastructure/ingestion.scheduler';
import { IngestionController } from './interface/ingestion.controller';

/**
 * Orchestration context. Imports the contexts it coordinates only for what they
 * EXPOSE: the command/query buses (CqrsModule), the Integrations capability, and
 * the Users tenant directory. It never reaches into their repositories directly.
 */
@Module({
  imports: [CqrsModule, IntegrationsModule, UsersModule],
  controllers: [IngestionController],
  providers: [
    IngestionOrchestrator,
    IngestionScheduler,
    GarminConnectedListener,
    { provide: GARMIN_FETCHER, useClass: GarminFetcherClient },
  ],
})
export class IngestionModule {}
