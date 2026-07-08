import { request } from './httpClient';
import { MOCK_API } from '@/shared/config';

// Frontend mirror of users/application/dto/user.response.ts — narrowed to the
// one setting the UI surfaces today.
export interface UserSettings {
  autoModeOptIn: boolean;
}

// GET /users/me
export async function fetchUserSettings(): Promise<UserSettings> {
  if (MOCK_API) {
    await delay();
    return { autoModeOptIn: false };
  }
  return request<UserSettings>('/users/me');
}

// PATCH /users/me/settings — toggles whether the scheduled weekly rollover
// (and the Auto Mode button) run the autonomous graph instead of opening a
// Plan-mode chat.
export async function updateAutoModeOptIn(autoModeOptIn: boolean): Promise<UserSettings> {
  if (MOCK_API) {
    await delay();
    return { autoModeOptIn };
  }
  return request<UserSettings>('/users/me/settings', {
    method: 'PATCH',
    body: { autoModeOptIn },
  });
}

function delay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
