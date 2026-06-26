import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import { PlannedSessionResponse } from '../dto/planned-session.response';
import { toPlannedSessionResponse } from '../planned-session.mapper';
import { GetCalendarRangeQuery } from './get-calendar-range.query';

@QueryHandler(GetCalendarRangeQuery)
export class GetCalendarRangeHandler
  implements IQueryHandler<GetCalendarRangeQuery, PlannedSessionResponse[]>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(
    query: GetCalendarRangeQuery,
  ): Promise<PlannedSessionResponse[]> {
    const sessions = await this.repository.findByDateRange(
      query.userId,
      query.from,
      query.to,
    );
    return sessions.map(toPlannedSessionResponse);
  }
}
