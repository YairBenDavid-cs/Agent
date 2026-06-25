import { Body, Controller, Get, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateTrainingProfileCommand } from '../application/commands/create-training-profile.command';
import { CreateTrainingProfileDto } from '../application/dto/create-training-profile.dto';
import { TrainingProfileStatusResponse } from '../application/dto/training-profile.response';
import { GetTrainingProfileQuery } from '../application/queries/get-training-profile.query';

@Controller('training-profile')
export class TrainingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * GET /training-profile/me — the caller's active profile plus an `onboarded`
   * flag the frontend uses to decide whether to route into the wizard.
   */
  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TrainingProfileStatusResponse> {
    return this.queryBus.execute<
      GetTrainingProfileQuery,
      TrainingProfileStatusResponse
    >(new GetTrainingProfileQuery(user.userId));
  }

  /**
   * POST /training-profile — single atomic onboarding submit. The whole wizard
   * payload is validated as one discriminated DTO; a new active profile is
   * written and the matching `users` fields are patched in one transaction.
   */
  @Post()
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTrainingProfileDto,
  ): Promise<{ onboarded: true }> {
    return this.commandBus.execute<
      CreateTrainingProfileCommand,
      { onboarded: true }
    >(new CreateTrainingProfileCommand(user.userId, dto));
  }
}
