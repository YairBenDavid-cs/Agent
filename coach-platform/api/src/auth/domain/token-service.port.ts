import {
  AccessTokenPayload,
  IssuedToken,
  RefreshTokenPayload,
} from './tokens';

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

/**
 * Abstracts JWT signing/verification and refresh-token hashing. Access-token
 * verification on normal requests is handled by the Passport strategy; this port
 * covers issuance everywhere plus the explicit refresh-token verification used
 * by the refresh flow.
 */
export interface TokenServicePort {
  signAccess(payload: AccessTokenPayload): IssuedToken;
  signRefresh(payload: RefreshTokenPayload): IssuedToken;
  /** Verify a refresh token's signature + expiry. Throws ApiError on failure. */
  verifyRefresh(token: string): RefreshTokenPayload;
  /** Stable hash of a raw refresh token for storage/comparison (never the raw token). */
  hashRefreshToken(token: string): string;
}
