import { CalendarSync } from '../../domain/planned-session.model';

/**
 * Persist the calendar-sync projection state on a single train after the agent
 * tier pushes (or fails to push) the owned Google Calendar event. The external
 * Google call itself lives in the CalendarSyncService; this command only records
 * the resulting `{ eventId, syncedAt, syncState }` so `planned_sessions` stays
 * the source of truth and the Google event is a downstream projection.
 */
export class UpdateCalendarSyncCommand {
  constructor(
    public readonly userId: string,
    public readonly plannedSessionId: string,
    public readonly calendarSync: CalendarSync,
  ) {}
}

export interface UpdateCalendarSyncResult {
  updated: true;
}
