import { Body, Controller, Get, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  CreateProgramCommand,
  CreateProgramResult,
} from '../application/commands/create-program.command';
import { CreateProgramDto } from '../application/dto/create-program.dto';
import { ActiveProgramResponse } from '../application/dto/program.response';
import { GetActiveProgramQuery } from '../application/queries/get-active-program.query';

@Controller('programs')
export class ProgramController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** GET /programs/active — the caller's active program + week skeleton. */
  @Get('active')
  async active(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActiveProgramResponse> {
    return this.queryBus.execute<GetActiveProgramQuery, ActiveProgramResponse>(
      new GetActiveProgramQuery(user.userId),
    );
  }

  /** POST /programs — seed a new active program (archives any prior one). */
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProgramDto,
  ): Promise<CreateProgramResult> {
    return this.commandBus.execute<CreateProgramCommand, CreateProgramResult>(
      new CreateProgramCommand(user.userId, dto),
    );
  }
}
