import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../domain/users.repository.port';
import { toUserResponse, UserResponse } from '../dto/user.response';
import { GetUserQuery } from './get-user.query';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserResponse> {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly repository: UsersRepositoryPort,
  ) {}

  async execute(query: GetUserQuery): Promise<UserResponse> {
    const profile = await this.repository.findById(query.userId);
    if (!profile) {
      throw new NotFoundException('User not found.');
    }
    return toUserResponse(profile);
  }
}
