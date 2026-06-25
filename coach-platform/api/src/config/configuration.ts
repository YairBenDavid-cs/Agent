/**
 * Typed application configuration, loaded once and accessed via ConfigService.
 * Never read process.env outside this file.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongoUrl: string;
  credentialsEncryptionKey: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtlSec: number;
  jwtRefreshTtlSec: number;
  fetcherBaseUrl: string;
  fetcherTimeoutMs: number;
  ingestionBackfillDays: number;
  // Google Calendar per-user OAuth ("Web application" client). Empty when the
  // server operator hasn't configured Google Calendar connections yet.
  googleOauthClientId: string;
  googleOauthClientSecret: string;
  googleOauthRedirectUri: string;
}

export const loadConfiguration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV as string,
  port: parseInt(process.env.PORT as string, 10),
  mongoUrl: process.env.MONGO_URL as string,
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY as string,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  jwtAccessTtlSec: parseInt(process.env.JWT_ACCESS_TTL_SEC as string, 10),
  jwtRefreshTtlSec: parseInt(process.env.JWT_REFRESH_TTL_SEC as string, 10),
  fetcherBaseUrl: process.env.FETCHER_BASE_URL as string,
  fetcherTimeoutMs: parseInt(process.env.FETCHER_TIMEOUT_MS as string, 10),
  ingestionBackfillDays: parseInt(
    process.env.INGESTION_BACKFILL_DAYS as string,
    10,
  ),
  googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  googleOauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
  googleOauthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '',
});
