import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type { OnboardingPayload } from '../domain/types';

// POST /training-profile is a single atomic submit: the server validates the
// discipline-gated payload, writes the active profile and patches the matching
// `users` fields in one transaction, then returns { onboarded: true }.
export async function submitOnboarding(payload: OnboardingPayload): Promise<void> {
  if (MOCK_API) {
    // No backend in mock mode — simulate the round-trip so the signup ->
    // onboarding -> assistant flow works standalone.
    await new Promise((resolve) => setTimeout(resolve, 350));
    return;
  }
  await request<{ onboarded: true }>('/training-profile', {
    method: 'POST',
    body: payload,
  });
}
