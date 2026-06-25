import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../../users/domain/users.repository.port';
import {
  AUTH_CREDENTIALS_REPOSITORY,
  AuthCredentialsRepositoryPort,
} from '../../domain/auth-credentials.repository.port';
import {
  PASSWORD_HASHER,
  PasswordHasherPort,
} from '../../domain/password-hasher.port';
import { AuthResult } from '../dto/auth-result';
import { SessionIssuer } from '../services/session-issuer.service';
import { LoginCommand } from './login.command';

/**
 * Verifies email + password and issues a session. Every failure path returns the
 * same generic error, and a missing user/credential still runs a dummy verify so
 * response timing can't be used to enumerate accounts.
 */
@CommandHandler(LoginCommand)
export class LoginHandler
  implements ICommandHandler<LoginCommand, AuthResult>
{
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly users: UsersRepositoryPort,
    @Inject(AUTH_CREDENTIALS_REPOSITORY)
    private readonly credentials: AuthCredentialsRepositoryPort,
    @Inject(PASSWORD_HASHER)
    private readonly hasher: PasswordHasherPort,
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  async execute(command: LoginCommand): Promise<AuthResult> {
    const { email, password } = command.dto;

    const user = await this.users.findByEmail(email);
    const credential = user
      ? await this.credentials.findByUserId(user.userId)
      : null;

    if (!user || !credential) {
      await this.hasher.dummyVerify(password);
      throw ApiError.invalidCredentials();
    }

    const ok = await this.hasher.verify(credential.passwordHash, password);
    if (!ok) throw ApiError.invalidCredentials();

    const tokens = await this.sessionIssuer.issue(user.userId, user.role);
    return { tokens, user: { userId: user.userId, role: user.role } };
  }
}
