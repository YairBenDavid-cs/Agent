import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CryptoModule } from '../common/crypto/crypto.module';
import { IntegrationsService } from './application/integrations.service';
import { GARMIN_AUTH_CLIENT } from './domain/garmin-auth.port';
import { GoogleOAuthClient } from './domain/google-oauth';
import { INTEGRATIONS_REPOSITORY } from './domain/integrations.repository.port';
import { GarminAuthClient } from './infrastructure/garmin-auth.client';
import { GoogleApiOAuthClient } from './infrastructure/google/google-oauth.client';
import { IntegrationsRepository } from './infrastructure/integrations.repository';
import {
  UserIntegrations,
  UserIntegrationsSchema,
} from './infrastructure/user-integrations.schema';
import { IntegrationsController } from './interface/integrations.controller';

@Module({
  imports: [
    CryptoModule,
    MongooseModule.forFeature([
      { name: UserIntegrations.name, schema: UserIntegrationsSchema },
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [
    { provide: INTEGRATIONS_REPOSITORY, useClass: IntegrationsRepository },
    { provide: GoogleOAuthClient, useClass: GoogleApiOAuthClient },
    { provide: GARMIN_AUTH_CLIENT, useClass: GarminAuthClient },
    IntegrationsService,
  ],
  // Exposed so the ingestion orchestrator can fetch decrypted Garmin auth and
  // cache refreshed sessions. The repository token stays private.
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
