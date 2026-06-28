import { CalendarEventInput } from '../../integrations/domain/google-calendar';

/** The session fields needed to project a planned train onto a calendar event. */
export interface CalendarSyncSessionLike {
  id: string;
  title: string;
  coachNotes: string | null;
  scheduledStartUtc: string;
  estDurationMin: number;
  timezone: string;
}

/**
 * Pure projection of a committed planned session onto a Google Calendar event
 * input. The end instant is derived from the start instant + estDurationMin (the
 * Coach owns duration), so a single source field drives both ends. Tagged with
 * the planned session id so the owned-event guard can recognise it later.
 */
export function toCalendarEventInput(
  session: CalendarSyncSessionLike,
): CalendarEventInput {
  const startMs = Date.parse(session.scheduledStartUtc);
  const endMs = startMs + session.estDurationMin * 60 * 1000;
  return {
    summary: session.title,
    description: session.coachNotes ?? undefined,
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    timezone: session.timezone,
    plannedSessionId: session.id,
  };
}
