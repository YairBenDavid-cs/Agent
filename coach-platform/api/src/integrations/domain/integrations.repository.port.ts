import {
  StoredGarmin,
  StoredGoogleCalendar,
  StoredTelegram,
  UserIntegrationsRecord,
} from './integrations.record';

export const INTEGRATIONS_REPOSITORY = Symbol('INTEGRATIONS_REPOSITORY');

/**
 * Port for the encrypted integrations store. Deals ONLY in ciphertext (the
 * Stored* shapes). One document per user; providers are patched independently
 * so connecting Telegram never disturbs stored Garmin credentials.
 */
export interface IntegrationsRepositoryPort {
  find(userId: string): Promise<UserIntegrationsRecord | null>;
  upsertGarmin(userId: string, garmin: StoredGarmin): Promise<void>;
  upsertGoogleCalendar(
    userId: string,
    googleCalendar: StoredGoogleCalendar,
  ): Promise<void>;
  upsertTelegram(userId: string, telegram: StoredTelegram): Promise<void>;
  /** Cache a freshly minted Garmin session without touching the credentials. */
  updateGarminSession(
    userId: string,
    sessionEnc: string,
    sessionExpiresAt: string,
  ): Promise<void>;
}
