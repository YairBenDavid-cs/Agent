import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { SessionType } from '../domain/workout-session.model';
import {
  FindSessionsQuery,
} from '../application/queries/find-sessions.query';
import { SessionsPage } from '../application/queries/find-sessions.handler';
import { FindSessionsQueryDto } from './dto/find-sessions.query.dto';

const DEFAULT_PAGE_LIMIT = 50;

@Controller('sessions')
export class SessionsController {
  constructor(private readonly queryBus: QueryBus) {}

  /** GET /sessions?from=&to=&type=running&cursor= — the caller's workouts. */
  @Get()
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindSessionsQueryDto,
  ): Promise<SessionsPage> {
    return this.queryBus.execute(
      new FindSessionsQuery(
        user.userId,
        query.from,
        query.to,
        (query.type as SessionType) ?? null,
        query.cursor ?? null,
        DEFAULT_PAGE_LIMIT,
      ),
    );
  }
}
