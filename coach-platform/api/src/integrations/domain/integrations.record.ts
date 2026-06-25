/**
 * Persistence-facing record. Every secret here is ALREADY ciphertext
 * (CryptoService output). The repository only ever sees these opaque strings —
 * encryption/decryption is the application service's responsibility, so the
 * persistence layer can never accidentally store or log a plaintext secret.
 */

export interface StoredGarmin {
  email: string; // not a secret; an identifier
  passwordEnc: string;
  sessionEnc: string | null;
  sessionExpiresAt: string | null;
  updatedAt: string;
}

export interface StoredGoogleCalendar {
  refreshTokenEnc: string;
  updatedAt: string;
}

export interface StoredTelegram {
  chatId: string; // not a secret
  botTokenEnc: string;
  updatedAt: string;
}

export interface UserIntegrationsRecord {
  userId: string;
  garmin: StoredGarmin | null;
  googleCalendar: StoredGoogleCalendar | null;
  telegram: StoredTelegram | null;
}
