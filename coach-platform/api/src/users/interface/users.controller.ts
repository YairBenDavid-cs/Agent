import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { UserResponse } from '../application/dto/user.response';
import { GetUserQuery } from '../application/queries/get-user.query';

@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  // Account creation is owned by POST /auth/register (profile + credentials in
  // one transaction). CreateUserCommand stays internal for that flow.
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(user.userId),
    );
  }
}
