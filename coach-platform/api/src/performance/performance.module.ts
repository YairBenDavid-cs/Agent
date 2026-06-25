import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { AppendProfileChangesHandler } from './application/commands/append-profile-changes.handler';
import { UpsertPerformanceDayHandler } from './application/commands/upsert-performance-day.handler';
import {
  GetCurrentProfileHandler,
  GetMetricHistoryHandler,
  GetPerformanceRangeHandler,
} from './application/queries/performance.query-handlers';
import {
  PERFORMANCE_DAILY_REPOSITORY,
  PERFORMANCE_PROFILE_REPOSITORY,
} from './domain/performance.repository.port';
import { PerformanceDailyRepository } from './infrastructure/performance-daily.repository';
import {
  PerformanceDaily,
  PerformanceDailySchema,
} from './infrastructure/performance-daily.schema';
import { PerformanceProfileRepository } from './infrastructure/performance-profile.repository';
import {
  PerformanceProfileEntry,
  PerformanceProfileSchema,
} from './infrastructure/performance-profile.schema';
import { PerformanceController } from './interface/performance.controller';

const CommandHandlers = [
  UpsertPerformanceDayHandler,
  AppendProfileChangesHandler,
];
const QueryHandlers = [
  GetPerformanceRangeHandler,
  GetCurrentProfileHandler,
  GetMetricHistoryHandler,
];

@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([
      { name: PerformanceDaily.name, schema: PerformanceDailySchema },
      { name: PerformanceProfileEntry.name, schema: PerformanceProfileSchema },
    ]),
  ],
  controllers: [PerformanceController],
  providers: [
    { provide: PERFORMANCE_DAILY_REPOSITORY, useClass: PerformanceDailyRepository },
    {
      provide: PERFORMANCE_PROFILE_REPOSITORY,
      useClass: PerformanceProfileRepository,
    },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class PerformanceModule {}
