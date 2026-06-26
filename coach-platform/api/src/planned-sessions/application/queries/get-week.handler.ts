import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../domain/planned-session.repository.port';
import { PlannedSessionResponse } from '../dto/planned-session.response';
import { toPlannedSessionResponse } from '../planned-session.mapper';
import { GetWeekQuery } from './get-week.query';

@QueryHandler(GetWeekQuery)
export class GetWeekHandler
  implements IQueryHandler<GetWeekQuery, PlannedSessionResponse[]>
{
  constructor(
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly repository: PlannedSessionRepositoryPort,
  ) {}

  async execute(query: GetWeekQuery): Promise<PlannedSessionResponse[]> {
    const sessions = await this.repository.findByWeek(
      query.userId,
      query.programId,
      query.weekIndex,
    );
    return sessions.map(toPlannedSessionResponse);
  }
}
