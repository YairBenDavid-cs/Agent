import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../domain/users.repository.port';
import { UpdateUserProfileCommand } from './update-user-profile.command';

@CommandHandler(UpdateUserProfileCommand)
export class UpdateUserProfileHandler
  implements ICommandHandler<UpdateUserProfileCommand, void>
{
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly repository: UsersRepositoryPort,
  ) {}

  async execute(command: UpdateUserProfileCommand): Promise<void> {
    const updated = await this.repository.updateProfileFields(
      command.userId,
      command.patch,
    );
    if (!updated) {
      throw new NotFoundException('User not found.');
    }
  }
}
