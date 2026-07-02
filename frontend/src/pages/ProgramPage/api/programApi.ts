import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type {
  ActiveProgramResponse,
  PlannedSession,
} from '../domain/types';
import { MOCK_PROGRAM, MOCK_PLANNED_SESSIONS } from './mockData';

// GET /programs/active — the user's single active program (or { hasProgram:false }).
export async function fetchActiveProgram(): Promise<ActiveProgramResponse> {
  if (MOCK_API) {
    await delay();
    return { hasProgram: true, program: MOCK_PROGRAM };
  }
  return request<ActiveProgramResponse>('/programs/active');
}

// GET /planned-sessions?from&to — planned trains whose scheduled_date falls in
// the inclusive [from, to] window (YYYY-MM-DD), ordered for calendar rendering.
export async function fetchCalendarRange(
  from: string,
  to: string,
): Promise<PlannedSession[]> {
  if (MOCK_API) {
    await delay();
    return MOCK_PLANNED_SESSIONS.filter(
      (s) => s.scheduledDate >= from && s.scheduledDate <= to,
    );
  }
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return request<PlannedSession[]>(`/planned-sessions${query}`);
}

// GET /planned-sessions/week/:index?programId= — every planned session for one
// program week, including the full running/strength prescription. Used to enrich
// a build_session approval card in chat with the same workout body the program
// page renders.
export async function fetchProgramWeekSessions(
  programId: string,
  weekIndex: number,
): Promise<PlannedSession[]> {
  if (MOCK_API) {
    await delay();
    return MOCK_PLANNED_SESSIONS;
  }
  const query = `?programId=${encodeURIComponent(programId)}`;
  return request<PlannedSession[]>(`/planned-sessions/week/${weekIndex}${query}`);
}

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
