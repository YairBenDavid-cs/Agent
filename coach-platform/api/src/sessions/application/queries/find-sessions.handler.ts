import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  SESSIONS_REPOSITORY,
  SessionsRepositoryPort,
} from '../../domain/sessions.repository.port';
import { SessionResponse } from '../dto/session.response';
import { toSessionResponse } from '../sessions.mapper';
import { FindSessionsQuery } from './find-sessions.query';

export interface SessionsPage {
  items: SessionResponse[];
  nextCursor: number | null;
}

@QueryHandler(FindSessionsQuery)
export class FindSessionsHandler
  implements IQueryHandler<FindSessionsQuery, SessionsPage>
{
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly repository: SessionsRepositoryPort,
  ) {}

  async execute(query: FindSessionsQuery): Promise<SessionsPage> {
    const sessions = await this.repository.findRange(
      query.userId,
      query.from,
      query.to,
      query.type,
      query.cursor,
      query.limit + 1,
    );
    const hasMore = sessions.length > query.limit;
    const page = hasMore ? sessions.slice(0, query.limit) : sessions;
    return {
      items: page.map(toSessionResponse),
      nextCursor: hasMore ? page[page.length - 1].activityId : null,
    };
  }
}
