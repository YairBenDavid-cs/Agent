import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ACCESS_COOKIE } from '../auth.constants';
import { AccessTokenPayload } from '../domain/tokens';

/** Pulls the access token out of the httpOnly cookie (no Authorization header). */
const fromCookie = (req: Request): string | null => {
  const token = (req?.cookies as Record<string, string> | undefined)?.[
    ACCESS_COOKIE
  ];
  return token ?? null;
};

/**
 * Validates the access token on every protected request. Passport verifies the
 * HS256 signature + expiry; validate() shapes the request.user identity. The
 * role travels in the token, so authorization needs no DB lookup.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([fromCookie]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { userId: payload.sub, role: payload.role };
  }
}
