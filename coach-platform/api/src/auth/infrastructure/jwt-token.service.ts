import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { ApiError } from '../../common/errors/api-error';
import { TokenServicePort } from '../domain/token-service.port';
import {
  AccessTokenPayload,
  IssuedToken,
  RefreshTokenPayload,
} from '../domain/tokens';

/**
 * HS256 JWTs with two distinct secrets. Access tokens are also verified by the
 * Passport strategy on each request; this service owns issuance plus the
 * explicit refresh verification + refresh-token hashing.
 */
@Injectable()
export class JwtTokenService implements TokenServicePort {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtlSec = config.getOrThrow<number>('JWT_ACCESS_TTL_SEC');
    this.refreshTtlSec = config.getOrThrow<number>('JWT_REFRESH_TTL_SEC');
  }

  signAccess(payload: AccessTokenPayload): IssuedToken {
    const token = this.jwt.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtlSec,
    });
    return { token, ttlSec: this.accessTtlSec };
  }

  signRefresh(payload: RefreshTokenPayload): IssuedToken {
    const token = this.jwt.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtlSec,
    });
    return { token, ttlSec: this.refreshTtlSec };
  }

  verifyRefresh(token: string): RefreshTokenPayload {
    try {
      const decoded = this.jwt.verify<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
      if (!decoded?.sub || !decoded?.jti) {
        throw new Error('Missing claims.');
      }
      return { sub: decoded.sub, jti: decoded.jti };
    } catch {
      throw ApiError.tokenInvalid();
    }
  }

  hashRefreshToken(token: string): string {
    // Refresh tokens are high-entropy JWTs, so a fast SHA-256 is sufficient.
    return createHash('sha256').update(token).digest('hex');
  }
}
