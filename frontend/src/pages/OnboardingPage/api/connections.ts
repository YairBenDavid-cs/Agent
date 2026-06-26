import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';

/** Providers the connect step manages. Matches the server's IntegrationProvider. */
export type IntegrationProvider = 'garmin' | 'google_calendar' | 'telegram';

export interface IntegrationStatus {
  provider: IntegrationProvider;
  connected: boolean;
  updatedAt: string | null;
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

/** Read every provider's connection status for the current user. */
export async function fetchIntegrationStatuses(): Promise<IntegrationStatus[]> {
  if (MOCK_API) {
    return [
      { provider: 'garmin', connected: false, updatedAt: null },
      { provider: 'google_calendar', connected: false, updatedAt: null },
      { provider: 'telegram', connected: false, updatedAt: null },
    ];
  }
  return request<IntegrationStatus[]>('/integrations');
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
