import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { IntegrationsService } from '../../application/integrations.service';
import {
  CALENDAR_APP_ID,
  CalendarEvent,
  CalendarEventInput,
  CalendarWindow,
  GoogleCalendarClient,
} from '../../domain/google-calendar';
import { GoogleOAuthClient } from '../../domain/google-oauth';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary';

/** Subset of the Google event resource we read/write. */
interface GoogleEventResource {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/**
 * Google Calendar v3 client implemented directly over `fetch` (mirroring the
 * OAuth client's no-SDK approach). Resolves the user's stored refresh token into
 * a per-call access token; never persists access tokens.
 *
 * Owned-write safety: insert tags the event with our appId + plannedSessionId;
 * update/delete first GET the event and refuse unless that tag is present, so
 * the Planner can never mutate a user's personal events even if handed a stray
 * event id.
 */
@Injectable()
export class GoogleCalendarApiClient extends GoogleCalendarClient {
  private readonly logger = new Logger('GoogleCalendarClient');

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly oauth: GoogleOAuthClient,
  ) {
    super();
  }

  private async accessToken(userId: string): Promise<string> {
    const auth = await this.integrations.getDecryptedGoogleCalendarAuth(userId);
    const token = await this.oauth.refreshAccessToken(auth.refreshToken);
    return token.accessToken;
  }

  private async call(
    accessToken: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(`${CALENDAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(
        `Google Calendar API ${init.method ?? 'GET'} ${path} failed (${response.status}): ${body}`,
      );
    }
    return response;
  }

  async listEvents(
    userId: string,
    window: CalendarWindow,
  ): Promise<CalendarEvent[]> {
    const accessToken = await this.accessToken(userId);
    const params = new URLSearchParams({
      timeMin: window.fromUtc,
      timeMax: window.toUtc,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    const response = await this.call(accessToken, `/events?${params}`);
    const json = (await response.json()) as { items?: GoogleEventResource[] };
    return (json.items ?? [])
      .filter((e) => e.status !== 'cancelled')
      .map((e) => toCalendarEvent(e));
  }

  async insertEvent(
    userId: string,
    input: CalendarEventInput,
  ): Promise<{ eventId: string }> {
    const accessToken = await this.accessToken(userId);
    const response = await this.call(accessToken, '/events', {
      method: 'POST',
      body: JSON.stringify(toGoogleEvent(input)),
    });
    const json = (await response.json()) as GoogleEventResource;
    return { eventId: json.id };
  }

  async updateEvent(
    userId: string,
    eventId: string,
    input: CalendarEventInput,
  ): Promise<void> {
    const accessToken = await this.accessToken(userId);
    await this.assertOwned(accessToken, eventId);
    await this.call(accessToken, `/events/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      body: JSON.stringify(toGoogleEvent(input)),
    });
  }

  async deleteEvent(userId: string, eventId: string): Promise<void> {
    const accessToken = await this.accessToken(userId);
    await this.assertOwned(accessToken, eventId);
    await this.call(accessToken, `/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });
  }

  /** Refuse to mutate any event we did not create. */
  private async assertOwned(
    accessToken: string,
    eventId: string,
  ): Promise<void> {
    const response = await this.call(
      accessToken,
      `/events/${encodeURIComponent(eventId)}`,
    );
    if (response.status === 404) {
      // Already gone — nothing to mutate; treat as a no-op for idempotency.
      return;
    }
    const event = (await response.json()) as GoogleEventResource;
    if (event.extendedProperties?.private?.appId !== CALENDAR_APP_ID) {
      throw new ForbiddenException(
        'Refusing to modify a calendar event not created by this app.',
      );
    }
  }
}

function toCalendarEvent(e: GoogleEventResource): CalendarEvent {
  const priv = e.extendedProperties?.private ?? {};
  return {
    id: e.id,
    summary: e.summary ?? '(untitled)',
    start: e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`,
    end: e.end?.dateTime ?? `${e.end?.date}T23:59:59Z`,
    busy: e.transparency !== 'transparent',
    appOwned: priv.appId === CALENDAR_APP_ID,
    plannedSessionId: priv.plannedSessionId ?? null,
  };
}

/** Wire shape for insert/update (no `id` in the body — it lives in the URL). */
function toGoogleEvent(input: CalendarEventInput): Record<string, unknown> {
  return {
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    start: { dateTime: input.startUtc, timeZone: input.timezone },
    end: { dateTime: input.endUtc, timeZone: input.timezone },
    extendedProperties: {
      private: {
        appId: CALENDAR_APP_ID,
        plannedSessionId: input.plannedSessionId,
      },
    },
  };
}
