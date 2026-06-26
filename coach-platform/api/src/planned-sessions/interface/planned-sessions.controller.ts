import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { RecordOutcomeCommand } from '../application/commands/record-outcome.command';
import { PlannedSessionResponse } from '../application/dto/planned-session.response';
import { RecordOutcomeDto } from '../application/dto/record-outcome.dto';
import { GetCalendarRangeQuery } from '../application/queries/get-calendar-range.query';
import { GetWeekQuery } from '../application/queries/get-week.query';
import { CalendarRangeQueryDto } from './dto/calendar-range.query.dto';

@Controller('planned-sessions')
export class PlannedSessionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** GET /planned-sessions?from&to — calendar / card range fetch. */
  @Get()
  async range(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CalendarRangeQueryDto,
  ): Promise<PlannedSessionResponse[]> {
    return this.queryBus.execute<
      GetCalendarRangeQuery,
      PlannedSessionResponse[]
    >(new GetCalendarRangeQuery(user.userId, query.from, query.to));
  }

  /** GET /planned-sessions/week/:index?programId= — one program week. */
  @Get('week/:index')
  async week(
    @CurrentUser() user: AuthenticatedUser,
    @Param('index', ParseIntPipe) index: number,
    @Query('programId') programId: string,
  ): Promise<PlannedSessionResponse[]> {
    return this.queryBus.execute<GetWeekQuery, PlannedSessionResponse[]>(
      new GetWeekQuery(user.userId, programId, index),
    );
  }

  /** POST /planned-sessions/:id/outcome — record adherence (matcher/self-report). */
  @Post(':id/outcome')
  async recordOutcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordOutcomeDto,
  ): Promise<{ recorded: true }> {
    return this.commandBus.execute<RecordOutcomeCommand, { recorded: true }>(
      new RecordOutcomeCommand(user.userId, id, dto),
    );
  }
}
