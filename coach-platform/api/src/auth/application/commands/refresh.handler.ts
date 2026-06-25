import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../common/errors/api-error';
import { TransactionManager } from '../../../common/transaction/transaction.manager';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../../users/domain/users.repository.port';
import {
  AUTH_SESSIONS_REPOSITORY,
  AuthSessionsRepositoryPort,
} from '../../domain/auth-sessions.repository.port';
import {
  TOKEN_SERVICE,
  TokenServicePort,
} from '../../domain/token-service.port';
import { AuthResult } from '../dto/auth-result';
import { SessionIssuer } from '../services/session-issuer.service';
import { RefreshCommand } from './refresh.command';

/**
 * Refresh-token rotation with reuse detection. The old session is revoked and a
 * new one issued atomically. If a token whose session is already revoked is
 * presented, that's a replay of a stolen/rotated token — we revoke the user's
 * entire session chain as a safety cutoff.
 */
@CommandHandler(RefreshCommand)
export class RefreshHandler
  implements ICommandHandler<RefreshCommand, AuthResult>
{
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenServicePort,
    @Inject(AUTH_SESSIONS_REPOSITORY)
    private readonly sessions: AuthSessionsRepositoryPort,
    @Inject(USERS_REPOSITORY)
    private readonly users: UsersRepositoryPort,
    private readonly txn: TransactionManager,
    private readonly sessionIssuer: SessionIssuer,
  ) {}

  async execute(command: RefreshCommand): Promise<AuthResult> {
    // Signature + expiry first; cheap and needs no DB.
    const payload = this.tokens.verifyRefresh(command.refreshToken);

    return this.txn.runInTransaction(async () => {
      const now = new Date().toISOString();
      const session = await this.sessions.findByJti(payload.jti);
      if (!session) throw ApiError.tokenInvalid();

      // Reuse of an already-revoked session => possible theft: cut off all.
      if (session.revokedAt !== null) {
        await this.sessions.revokeAllForUser(payload.sub, now);
        throw ApiError.tokenInvalid();
      }

      const presentedHash = this.tokens.hashRefreshToken(command.refreshToken);
      if (presentedHash !== session.refreshTokenHash) {
        throw ApiError.tokenInvalid();
      }
      if (Date.parse(session.expiresAt) <= Date.now()) {
        throw ApiError.tokenInvalid();
      }

      const user = await this.users.findById(payload.sub);
      if (!user) throw ApiError.tokenInvalid();

      await this.sessions.revokeByJti(session.jti, now);
      const tokens = await this.sessionIssuer.issue(user.userId, user.role);
      return { tokens, user: { userId: user.userId, role: user.role } };
    });
  }
}
