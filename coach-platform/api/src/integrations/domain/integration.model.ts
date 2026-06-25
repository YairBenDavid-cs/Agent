/**
 * Integrations domain.
 *
 * Two distinct shapes intentionally never mix:
 *  - "Auth" types carry DECRYPTED secrets. They live only in memory, are handed
 *    to the ingestion orchestrator / fetch service, and are NEVER persisted as-is
 *    nor returned over the API.
 *  - "Status" types are the only thing safe to expose over the API: they say
 *    whether a provider is connected, never what the secret is.
 */

export type IntegrationProvider = 'garmin' | 'google_calendar' | 'telegram';

/** Garmin logs in with email + password; garminconnect then caches an OAuth
 * (garth) session. We store the credentials so we can re-auth, and cache the
 * session blob so we are not logging in on every fetch. */
export interface GarminCredentials {
  email: string;
  password: string;
}

export interface GarminSession {
  /** Opaque serialized garth/OAuth session produced by the fetch service. */
  token: string;
  expiresAt: string; // ISO8601
}

export interface GarminAuth {
  credentials: GarminCredentials;
  session: GarminSession | null;
}

/** Google Calendar uses OAuth — we keep only the refresh token, never a password. */
export interface GoogleCalendarAuth {
  refreshToken: string;
}

export interface TelegramAuth {
  chatId: string;
  botToken: string;
}

/** Safe, secret-free projection for API responses. */
export interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  /** When this provider's credentials were last written/updated. */
  updatedAt: string | null;
}
