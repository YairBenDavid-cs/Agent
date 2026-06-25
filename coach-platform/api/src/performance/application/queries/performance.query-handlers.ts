import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CollectionEnvelope } from '../../../common/dto/date-range.query';
import {
  PERFORMANCE_DAILY_REPOSITORY,
  PERFORMANCE_PROFILE_REPOSITORY,
  PerformanceDailyRepositoryPort,
  PerformanceProfileRepositoryPort,
} from '../../domain/performance.repository.port';
import {
  MetricHistoryPointResponse,
  PerformanceDayResponse,
  ProfileCurrentResponse,
} from '../dto/performance.responses';
import {
  toMetricHistoryPoint,
  toPerformanceDayResponse,
  toProfileCurrentResponse,
} from '../performance.mapper';
import {
  GetCurrentProfileQuery,
  GetMetricHistoryQuery,
  GetPerformanceRangeQuery,
} from './performance.queries';

@QueryHandler(GetPerformanceRangeQuery)
export class GetPerformanceRangeHandler
  implements
    IQueryHandler<
      GetPerformanceRangeQuery,
      CollectionEnvelope<PerformanceDayResponse>
    >
{
  constructor(
    @Inject(PERFORMANCE_DAILY_REPOSITORY)
    private readonly repository: PerformanceDailyRepositoryPort,
  ) {}

  async execute(
    query: GetPerformanceRangeQuery,
  ): Promise<CollectionEnvelope<PerformanceDayResponse>> {
    const days = await this.repository.findRange(
      query.userId,
      query.from,
      query.to,
      query.cursor,
      query.limit + 1,
    );
    const hasMore = days.length > query.limit;
    const page = hasMore ? days.slice(0, query.limit) : days;
    return {
      items: page.map(toPerformanceDayResponse),
      nextCursor: hasMore ? page[page.length - 1].date : null,
    };
  }
}

@QueryHandler(GetCurrentProfileQuery)
export class GetCurrentProfileHandler
  implements IQueryHandler<GetCurrentProfileQuery, ProfileCurrentResponse[]>
{
  constructor(
    @Inject(PERFORMANCE_PROFILE_REPOSITORY)
    private readonly repository: PerformanceProfileRepositoryPort,
  ) {}

  async execute(
    query: GetCurrentProfileQuery,
  ): Promise<ProfileCurrentResponse[]> {
    const current = await this.repository.getCurrentProfile(query.userId);
    return current.map(toProfileCurrentResponse);
  }
}

@QueryHandler(GetMetricHistoryQuery)
export class GetMetricHistoryHandler
  implements IQueryHandler<GetMetricHistoryQuery, MetricHistoryPointResponse[]>
{
  constructor(
    @Inject(PERFORMANCE_PROFILE_REPOSITORY)
    private readonly repository: PerformanceProfileRepositoryPort,
  ) {}

  async execute(
    query: GetMetricHistoryQuery,
  ): Promise<MetricHistoryPointResponse[]> {
    const history = await this.repository.findMetricHistory(
      query.userId,
      query.metric,
    );
    return history.map(toMetricHistoryPoint);
  }
}
