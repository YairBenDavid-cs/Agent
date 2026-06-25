import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { loadConfiguration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PerformanceModule } from './performance/performance.module';
import { RecoveryModule } from './recovery/recovery.module';
import { SessionsModule } from './sessions/sessions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Validated, typed config available everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfiguration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,

    // Bounded contexts.
    UsersModule,
    IntegrationsModule,
    RecoveryModule,
    PerformanceModule,
    SessionsModule,
    IngestionModule,
  ],
})
export class AppModule {}
