import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { UserProfile } from '../../domain/user.model';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../domain/users.repository.port';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler
  implements ICommandHandler<CreateUserCommand, { id: string }>
{
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly repository: UsersRepositoryPort,
  ) {}

  async execute(command: CreateUserCommand): Promise<{ id: string }> {
    const { dto } = command;
    if (await this.repository.findByEmail(dto.email)) {
      throw new ConflictException('A user with this email already exists.');
    }

    const profile: UserProfile = {
      userId: `u_${randomUUID()}`,
      email: dto.email,
      name: dto.name,
      dateOfBirth: dto.dateOfBirth,
      sex: dto.sex,
      country: dto.country,
      timezone: dto.timezone,
      locale: dto.locale ?? 'en',
      units: dto.units ?? 'metric',
      heightCm: dto.heightCm ?? null,
      weightKg: dto.weightKg ?? null,
      status: 'active',
      role: 'user',
    };
    await this.repository.create(profile);
    return { id: profile.userId };
  }
}
