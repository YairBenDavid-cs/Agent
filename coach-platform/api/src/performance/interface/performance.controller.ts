import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  CollectionEnvelope,
  DateRangeQuery,
} from '../../common/dto/date-range.query';
import {
  MetricHistoryPointResponse,
  PerformanceDayResponse,
  ProfileCurrentResponse,
} from '../application/dto/performance.responses';
import {
  GetCurrentProfileQuery,
  GetMetricHistoryQuery,
  GetPerformanceRangeQuery,
} from '../application/queries/performance.queries';

const DEFAULT_PAGE_LIMIT = 31;

@Controller('performance')
export class PerformanceController {
  constructor(private readonly queryBus: QueryBus) {}

  /** GET /performance/days — daily rolling aggregates over a date range. */
  @Get('days')
  async getDays(
    @CurrentUser() user: AuthenticatedUser,
    @Query() range: DateRangeQuery,
  ): Promise<CollectionEnvelope<PerformanceDayResponse>> {
    return this.queryBus.execute(
      new GetPerformanceRangeQuery(
        user.userId,
        range.from,
        range.to,
        range.cursor ?? null,
        DEFAULT_PAGE_LIMIT,
      ),
    );
  }

  /** GET /performance/profile — current value of every slow-moving marker. */
  @Get('profile')
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProfileCurrentResponse[]> {
    return this.queryBus.execute(new GetCurrentProfileQuery(user.userId));
  }

  /** GET /performance/profile/:metric/history — trend of one marker. */
  @Get('profile/:metric/history')
  async getMetricHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('metric') metric: string,
  ): Promise<MetricHistoryPointResponse[]> {
    return this.queryBus.execute(
      new GetMetricHistoryQuery(user.userId, metric),
    );
  }
}
