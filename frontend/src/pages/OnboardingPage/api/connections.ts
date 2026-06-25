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

/** Store Garmin credentials (encrypted server-side). Resolves on success. */
export async function connectGarmin(input: GarminCredentials): Promise<void> {
  if (MOCK_API) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return;
  }
  await request<void>('/integrations/garmin', { method: 'PUT', body: input });
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
