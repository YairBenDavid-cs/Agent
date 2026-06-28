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
 * Fallback for SSE: the browser EventSource API cannot send custom headers and
 * some setups strip cookies on cross-origin event streams, so the chat workflow
 * stream may pass the access token as `?access_token=`. Only ever consulted when
 * the cookie is absent; same signed token, same validation.
 */
const fromQuery = (req: Request): string | null => {
  const token = (req?.query as Record<string, unknown> | undefined)?.[
    'access_token'
  ];
  return typeof token === 'string' && token.length > 0 ? token : null;
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
      jwtFromRequest: ExtractJwt.fromExtractors([fromCookie, fromQuery]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { userId: payload.sub, role: payload.role };
  }
}
