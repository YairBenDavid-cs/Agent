/**
 * One refresh-token session (one per device/login). The raw refresh token is
 * never stored — only its hash. `jti` is the token's unique id; rotation revokes
 * the old row and inserts a new one. Reuse of a revoked row signals theft.
 */
export interface AuthSession {
  userId: string;
  jti: string;
  refreshTokenHash: string;
  expiresAt: string; // ISO8601
  revokedAt: string | null;
}
