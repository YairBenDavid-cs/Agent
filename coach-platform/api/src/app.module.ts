import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/interface/jwt-auth.guard';
import { TransactionModule } from './common/transaction/transaction.module';
import { loadConfiguration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PerformanceModule } from './performance/performance.module';
import { PlannedSessionsModule } from './planned-sessions/planned-sessions.module';
import { ProgramModule } from './program/program.module';
import { ProgramMatchingModule } from './program-matching/program-matching.module';
import { RecoveryModule } from './recovery/recovery.module';
import { SessionsModule } from './sessions/sessions.module';
import { TrainingModule } from './training/training.module';
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
    // Ambient Mongo transactions, available app-wide.
    TransactionModule,

    // Bounded contexts.
    UsersModule,
    AuthModule,
    IntegrationsModule,
    RecoveryModule,
    PerformanceModule,
    SessionsModule,
    TrainingModule,
    IngestionModule,
    ProgramModule,
    PlannedSessionsModule,
    ProgramMatchingModule,
  ],
  providers: [
    // Secure-by-default: every route needs a valid access token unless @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
