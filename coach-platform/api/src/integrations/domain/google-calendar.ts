/** DI token for the Google Calendar CRUD client port. */
export const GOOGLE_CALENDAR_CLIENT = Symbol('GOOGLE_CALENDAR_CLIENT');

/** Tag written into every app-created event's extendedProperties.private so the
 * Planner can recognise events it owns and NEVER touch the user's own events. */
export const CALENDAR_APP_ID = 'coach-platform';

/** A real calendar event as read back from Google (for clash detection). */
export interface CalendarEvent {
  id: string;
  summary: string;
  /** ISO start/end. All-day events are normalised to date-time at parse. */
  start: string;
  end: string;
  /** transparency !== 'transparent' → the slot counts as busy. */
  busy: boolean;
  /** True when this event was created by us (carries our appId tag). */
  appOwned: boolean;
  /** The planned session this event projects, when app-owned. */
  plannedSessionId: string | null;
}

/** Inclusive time window to read, as ISO timestamps. */
export interface CalendarWindow {
  fromUtc: string;
  toUtc: string;
}

/** Everything needed to create/update one training event. */
export interface CalendarEventInput {
  summary: string;
  description?: string;
  startUtc: string;
  endUtc: string;
  /** IANA timezone the event is displayed in (e.g. "Europe/Madrid"). */
  timezone: string;
  /** The planned session id this event projects — stored as the owned-tag. */
  plannedSessionId: string;
}

/**
 * Port for Google Calendar read + owned-write operations on a user's connected
 * calendar. The implementation resolves the user's refresh token (decrypted via
 * IntegrationsService) into a short-lived access token per call.
 *
 * SAFETY CONTRACT: reads see ALL events (for clash detection) but writes/edits/
 * deletes are restricted to events this app created — enforced by the appId tag.
 */
export abstract class GoogleCalendarClient {
  /** Read all events (busy + titles) in the window for clash detection. */
  abstract listEvents(
    userId: string,
    window: CalendarWindow,
  ): Promise<CalendarEvent[]>;

  /** Create a training event; returns its Google event id. Tags it app-owned. */
  abstract insertEvent(
    userId: string,
    input: CalendarEventInput,
  ): Promise<{ eventId: string }>;

  /** Update an app-owned event. Rejects if the event is not app-owned. */
  abstract updateEvent(
    userId: string,
    eventId: string,
    input: CalendarEventInput,
  ): Promise<void>;

  /** Delete an app-owned event. Rejects if the event is not app-owned. */
  abstract deleteEvent(userId: string, eventId: string): Promise<void>;
}
