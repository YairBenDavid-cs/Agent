import { Body, Controller, Get, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { CreateUserDto } from '../application/dto/create-user.dto';
import { UserResponse } from '../application/dto/user.response';
import { GetUserQuery } from '../application/queries/get-user.query';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    const { id } = await this.commandBus.execute<
      CreateUserCommand,
      { id: string }
    >(new CreateUserCommand(dto));
    return this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(id),
    );
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(user.userId),
    );
  }
}
