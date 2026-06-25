/**
 * Typed application configuration, loaded once and accessed via ConfigService.
 * Never read process.env outside this file.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongoUrl: string;
  credentialsEncryptionKey: string;
  fetcherBaseUrl: string;
  fetcherTimeoutMs: number;
  ingestionBackfillDays: number;
}

export const loadConfiguration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV as string,
  port: parseInt(process.env.PORT as string, 10),
  mongoUrl: process.env.MONGO_URL as string,
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY as string,
  fetcherBaseUrl: process.env.FETCHER_BASE_URL as string,
  fetcherTimeoutMs: parseInt(process.env.FETCHER_TIMEOUT_MS as string, 10),
  ingestionBackfillDays: parseInt(
    process.env.INGESTION_BACKFILL_DAYS as string,
    10,
  ),
});
