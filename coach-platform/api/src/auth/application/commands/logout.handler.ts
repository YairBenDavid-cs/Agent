import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_SESSIONS_REPOSITORY,
  AuthSessionsRepositoryPort,
} from '../../domain/auth-sessions.repository.port';
import {
  TOKEN_SERVICE,
  TokenServicePort,
} from '../../domain/token-service.port';
import { LogoutCommand } from './logout.command';

/**
 * Best-effort session revocation. Logout always "succeeds" from the client's
 * view (the controller clears cookies regardless); we only revoke the row when a
 * valid refresh token identifies it. An invalid/absent token is a no-op.
 */
@CommandHandler(LogoutCommand)
export class LogoutHandler
  implements ICommandHandler<LogoutCommand, void>
{
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenServicePort,
    @Inject(AUTH_SESSIONS_REPOSITORY)
    private readonly sessions: AuthSessionsRepositoryPort,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    if (!command.refreshToken) return;
    try {
      const { jti } = this.tokens.verifyRefresh(command.refreshToken);
      await this.sessions.revokeByJti(jti, new Date().toISOString());
    } catch {
      // Invalid/expired token — nothing to revoke.
    }
  }
}
