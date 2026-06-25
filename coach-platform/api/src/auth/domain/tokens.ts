import { UserRole } from '../../users/domain/user.model';

/** Access token claims. `role` is embedded so authorization needs no DB hit. */
export interface AccessTokenPayload {
  sub: string; // userId
  role: UserRole;
}

/** Refresh token claims — minimal: identity + the session id to rotate against. */
export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string;
}

/** A signed token plus its lifetime, used to set the matching cookie max-age. */
export interface IssuedToken {
  token: string;
  ttlSec: number;
}

/** Both tokens issued together at login/register/refresh. */
export interface TokenPair {
  access: IssuedToken;
  refresh: IssuedToken;
  jti: string;
}
