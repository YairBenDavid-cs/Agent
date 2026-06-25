import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from '../auth.constants';
import { TokenPair } from '../domain/tokens';

/**
 * Owns the HTTP cookie contract for auth. Tokens live only in httpOnly cookies
 * (never JS-readable, never in the response body). The refresh cookie is scoped
 * to the refresh path so it isn't sent on every request, shrinking its exposure.
 */
@Injectable()
export class AuthCookieService {
  private readonly secure: boolean;

  constructor(config: ConfigService) {
    this.secure = config.getOrThrow<string>('NODE_ENV') === 'production';
  }

  private base(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax' };
  }

  setAuthCookies(res: Response, tokens: TokenPair): void {
    res.cookie(ACCESS_COOKIE, tokens.access.token, {
      ...this.base(),
      path: '/',
      maxAge: tokens.access.ttlSec * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refresh.token, {
      ...this.base(),
      path: REFRESH_COOKIE_PATH,
      maxAge: tokens.refresh.ttlSec * 1000,
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.base(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, {
      ...this.base(),
      path: REFRESH_COOKIE_PATH,
    });
  }
}
