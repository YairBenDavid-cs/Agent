import { Body, Controller, Get, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { GarminSyncSchedule } from '../domain/garmin-sync-schedule.model';
import { UpsertGarminSyncScheduleCommand } from '../application/commands/upsert-garmin-sync-schedule.command';
import { GetGarminSyncScheduleQuery } from '../application/queries/get-garmin-sync-schedule.query';
import { UpsertGarminSyncScheduleDto } from './dto/garmin-sync-schedule.dto';

/** Lets a user view/configure their recurring Garmin sync (up to 3x/day + Plan vs Auto). */
@Controller('ingestion/garmin-sync-schedule')
export class GarminSyncScheduleController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GarminSyncSchedule> {
    return this.queryBus.execute<GetGarminSyncScheduleQuery, GarminSyncSchedule>(
      new GetGarminSyncScheduleQuery(user.userId),
    );
  }

  @Put()
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertGarminSyncScheduleDto,
  ): Promise<GarminSyncSchedule> {
    return this.commandBus.execute<
      UpsertGarminSyncScheduleCommand,
      GarminSyncSchedule
    >(
      new UpsertGarminSyncScheduleCommand(
        user.userId,
        dto.syncTimesLocal,
        dto.mode,
        dto.enabled,
      ),
    );
  }
}
