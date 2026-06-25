import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_CREDENTIALS_REPOSITORY,
  AuthCredentialsRepositoryPort,
} from '../../domain/auth-credentials.repository.port';
import {
  PASSWORD_HASHER,
  PasswordHasherPort,
} from '../../domain/password-hasher.port';
import { CreateCredentialsCommand } from './create-credentials.command';

@CommandHandler(CreateCredentialsCommand)
export class CreateCredentialsHandler
  implements ICommandHandler<CreateCredentialsCommand, void>
{
  constructor(
    @Inject(PASSWORD_HASHER)
    private readonly hasher: PasswordHasherPort,
    @Inject(AUTH_CREDENTIALS_REPOSITORY)
    private readonly credentials: AuthCredentialsRepositoryPort,
  ) {}

  async execute(command: CreateCredentialsCommand): Promise<void> {
    const passwordHash = await this.hasher.hash(command.password);
    await this.credentials.create({
      userId: command.userId,
      passwordHash,
      algo: this.hasher.algo,
    });
  }
}
