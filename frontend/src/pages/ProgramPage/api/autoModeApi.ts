import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type { AutoModeScenario, RunAutoModeOutcome } from '../domain/types';

// Frontend mirror of agents/auto-mode's manual-trigger surface — the "Auto
// Mode" button on the program page. Chat-triggered and scheduled-rollover
// runs go through the same backend orchestrator but never touch this file.

// POST /assistant/auto-mode/run — kick off one autonomous run on the current
// week. The reply is already posted into `conversationId`; the caller
// navigates there so the user sees the verbose explanation (hard constraint #4).
export async function runAutoMode(scenario: AutoModeScenario): Promise<RunAutoModeOutcome> {
  if (MOCK_API) {
    await delay();
    return { conversationId: 'mock-conversation', reply: 'Auto Mode built next week.' };
  }
  return request<RunAutoModeOutcome>('/assistant/auto-mode/run', {
    method: 'POST',
    body: { scenario },
  });
}

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
