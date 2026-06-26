import { GarminSession } from './integration.model';

/**
 * Port for authenticating to Garmin via the stateless fetch service. This is the
 * integrations context's own seam: secret custody (encrypt/store) is the
 * integrations job, so the login round-trip lives here rather than in ingestion.
 * The ingestion fetcher reuses the cached session this produces.
 */
export const GARMIN_AUTH_CLIENT = Symbol('GARMIN_AUTH_CLIENT');

/** Login succeeded; `session` is the cacheable garth blob. */
export interface GarminAuthOk {
  status: 'ok';
  session: GarminSession;
}

/** Garmin demands a 2FA code; `loginId` resumes the login once the code arrives. */
export interface GarminAuthMfaRequired {
  status: 'mfa_required';
  loginId: string;
}

/** Credentials were rejected — the user should re-enter them. */
export interface GarminAuthInvalidCredentials {
  status: 'invalid_credentials';
}

export type GarminAuthResult =
  | GarminAuthOk
  | GarminAuthMfaRequired
  | GarminAuthInvalidCredentials;

/** The pending 2FA login was unknown or timed out — restart from credentials. */
export interface GarminMfaExpired {
  status: 'expired';
}

/** The supplied 2FA code was wrong — the user should try again. */
export interface GarminMfaInvalidCode {
  status: 'invalid_code';
}

export type GarminMfaResult =
  | GarminAuthOk
  | GarminMfaInvalidCode
  | GarminMfaExpired;

export interface GarminAuthClientPort {
  authenticate(email: string, password: string): Promise<GarminAuthResult>;
  completeMfa(loginId: string, code: string): Promise<GarminMfaResult>;
}
