import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRole } from '../../../users/domain/user.model';
import {
  AUTH_SESSIONS_REPOSITORY,
  AuthSessionsRepositoryPort,
} from '../../domain/auth-sessions.repository.port';
import {
  TOKEN_SERVICE,
  TokenServicePort,
} from '../../domain/token-service.port';
import { TokenPair } from '../../domain/tokens';

/**
 * Mints a fresh access+refresh pair and records the refresh session. The raw
 * refresh token is returned to the caller (to set the cookie) but only its hash
 * is persisted, so a DB leak can't be replayed. One call == one session row.
 */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenServicePort,
    @Inject(AUTH_SESSIONS_REPOSITORY)
    private readonly sessions: AuthSessionsRepositoryPort,
  ) {}

  async issue(userId: string, role: UserRole): Promise<TokenPair> {
    const jti = randomUUID();
    const access = this.tokens.signAccess({ sub: userId, role });
    const refresh = this.tokens.signRefresh({ sub: userId, jti });
    const expiresAt = new Date(
      Date.now() + refresh.ttlSec * 1000,
    ).toISOString();

    await this.sessions.create({
      userId,
      jti,
      refreshTokenHash: this.tokens.hashRefreshToken(refresh.token),
      expiresAt,
      revokedAt: null,
    });

    return { access, refresh, jti };
  }
}
