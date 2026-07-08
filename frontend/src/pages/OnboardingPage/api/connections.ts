import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';

/** Providers the connect step manages. Matches the server's IntegrationProvider. */
export type IntegrationProvider = 'garmin' | 'google_calendar' | 'telegram';

/** Garmin ingestion run state (mirrors the server's GarminSyncStatus). */
export type GarminSyncStatus =
  | 'syncing'
  | 'synced'
  | 'auth_failed'
  | 'sync_failed';

export interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  updatedAt: string | null;
  /** Garmin only — the latest ingestion run's status. */
  syncStatus?: GarminSyncStatus | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export interface GarminCredentials {
  email: string;
  password: string;
}

/**
 * Outcome of a Garmin connect/verify attempt. `connected` means we're done;
 * `mfa_required` means Garmin sent a 2FA code and the caller must submit it with
 * the returned `loginId`.
 */
export type GarminConnectResult =
  | { status: 'connected' }
  | { status: 'mfa_required'; loginId: string };

export interface GarminMfaInput {
  loginId: string;
  code: string;
  email: string;
  password: string;
}

/** Plan: recommend + wait for approval. Auto: apply, then report what changed. */
export type GarminSyncMode = 'plan' | 'auto';

/** The user's configured recurring Garmin sync (mirrors the server's GarminSyncSchedule). */
export interface GarminSyncSchedule {
  syncTimesLocal: string[];
  mode: GarminSyncMode;
  enabled: boolean;
  lastFiredAt: Record<string, string>;
}

/** Read every provider's connection status for the current user. */
export async function fetchIntegrationStatuses(): Promise<IntegrationStatus[]> {
  if (MOCK_API) {
    return [
      { provider: 'garmin', connected: false, updatedAt: null, syncStatus: null },
      { provider: 'google_calendar', connected: false, updatedAt: null },
      { provider: 'telegram', connected: false, updatedAt: null },
    ];
  }
  return request<IntegrationStatus[]>('/integrations');
}

/**
 * Re-run the Garmin ingestion for the current user using the stored session
 * token — no re-login. Used as the "Retry sync" action when the initial backfill
 * fails to land data. Rejects with an {@link ApiError} on failure.
 */
export async function runGarminSync(): Promise<void> {
  if (MOCK_API) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return;
  }
  await request<unknown>('/ingestion/run', { method: 'POST', body: {} });
}

const DEFAULT_GARMIN_SYNC_SCHEDULE: GarminSyncSchedule = {
  syncTimesLocal: ['04:00'],
  mode: 'plan',
  enabled: true,
  lastFiredAt: {},
};

/** Read the current user's recurring Garmin sync schedule (times + Plan/Auto mode). */
export async function fetchGarminSyncSchedule(): Promise<GarminSyncSchedule> {
  if (MOCK_API) {
    return DEFAULT_GARMIN_SYNC_SCHEDULE;
  }
  return request<GarminSyncSchedule>('/ingestion/garmin-sync-schedule');
}

/** Save the sync times (max 3, "HH:mm") + mode for the current user. */
export async function saveGarminSyncSchedule(
  input: Pick<GarminSyncSchedule, 'syncTimesLocal' | 'mode' | 'enabled'>,
): Promise<GarminSyncSchedule> {
  if (MOCK_API) {
    return { ...DEFAULT_GARMIN_SYNC_SCHEDULE, ...input };
  }
  return request<GarminSyncSchedule>('/ingestion/garmin-sync-schedule', {
    method: 'PUT',
    body: input,
  });
}

/**
 * Attempt a Garmin login. Resolves with `connected` on success, or
 * `mfa_required` (plus a `loginId`) when Garmin issues a 2FA challenge. Rejects
 * with an {@link ApiError} on invalid credentials so the caller can show it.
 */
export async function connectGarmin(
  input: GarminCredentials,
): Promise<GarminConnectResult> {
  if (MOCK_API) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 'connected' };
  }
  return request<GarminConnectResult>('/integrations/garmin', {
    method: 'PUT',
    body: input,
  });
}

/** Submit a 2FA code to finish a pending Garmin login. */
export async function verifyGarminMfa(
  input: GarminMfaInput,
): Promise<GarminConnectResult> {
  if (MOCK_API) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 'connected' };
  }
  return request<GarminConnectResult>('/integrations/garmin/mfa', {
    method: 'PUT',
    body: input,
  });
}

/**
 * Begin the Google Calendar OAuth flow: fetch the consent URL and hand the
 * browser over to Google. Google redirects back to the onboarding route with a
 * `?code=`, which {@link completeGoogleConnect} then exchanges.
 */
export async function startGoogleConnect(): Promise<void> {
  if (MOCK_API) {
    // No real OAuth in mock mode — bounce back to onboarding with a fake code so
    // the connect step's exchange path still exercises end to end.
    window.location.assign('/onboarding?code=mock-google-code');
    return;
  }
  const { url } = await request<{ url: string }>(
    '/integrations/google-calendar/auth-url',
  );
  window.location.assign(url);
}

/** Exchange the OAuth authorization code Google returned for a stored token. */
export async function completeGoogleConnect(code: string): Promise<void> {
  if (MOCK_API) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return;
  }
  await request<void>('/integrations/google-calendar', {
    method: 'PUT',
    body: { code },
  });
}
