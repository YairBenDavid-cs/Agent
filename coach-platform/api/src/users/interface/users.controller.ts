import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UserResponse } from '../application/dto/user.response';
import { UpdateUserSettingsDto } from '../application/dto/update-user-settings.dto';
import { GetUserQuery } from '../application/queries/get-user.query';
import { UpdateUserProfileCommand } from '../application/commands/update-user-profile.command';

@Controller('users')
export class UsersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  // Account creation is owned by POST /auth/register (profile + credentials in
  // one transaction). CreateUserCommand stays internal for that flow.
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(user.userId),
    );
  }

  @Patch('me/settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserResponse> {
    await this.commandBus.execute(
      new UpdateUserProfileCommand(user.userId, {
        autoModeOptIn: dto.autoModeOptIn,
      }),
    );
    return this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(user.userId),
    );
  }
}
