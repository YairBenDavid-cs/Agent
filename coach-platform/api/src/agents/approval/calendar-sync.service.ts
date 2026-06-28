import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { GoogleCalendarClient } from '../../integrations/domain/google-calendar';
import { CalendarSync } from '../../planned-sessions/domain/planned-session.model';
import {
  UpdateCalendarSyncCommand,
  UpdateCalendarSyncResult,
} from '../../planned-sessions/application/commands/update-calendar-sync.command';
import {
  CalendarSyncSessionLike,
  toCalendarEventInput,
} from './calendar-event.builder';

/** A session plus its current sync projection (so we know insert vs update). */
export interface SyncableSession extends CalendarSyncSessionLike {
  calendarSync: CalendarSync | null;
}

export interface CalendarSyncSummary {
  synced: number;
  failed: number;
}

/**
 * Commit-time calendar sync. After a week is committed (approval), each session
 * is projected onto an owned Google Calendar event: a session with no event id
 * is inserted, one with an existing id is updated (idempotent re-sync). The
 * resulting `{ eventId, syncedAt, syncState }` is written back THROUGH the
 * UpdateCalendarSyncCommand so `planned_sessions` stays the source of truth and
 * the Google event is a downstream projection.
 *
 * Failures are isolated per session (one bad push never aborts the batch); the
 * session is marked `syncState: 'failed'` for a later retry, and the run
 * continues. The Google event is only ever created here — at commit — never
 * during tentative placement.
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly calendar: GoogleCalendarClient,
    private readonly commandBus: CommandBus,
  ) {}

  async syncWeek(
    userId: string,
    sessions: SyncableSession[],
  ): Promise<CalendarSyncSummary> {
    let synced = 0;
    let failed = 0;

    for (const session of sessions) {
      const existingEventId = session.calendarSync?.eventId ?? null;
      try {
        const input = toCalendarEventInput(session);
        let eventId = existingEventId;
        if (eventId) {
          await this.calendar.updateEvent(userId, eventId, input);
        } else {
          const res = await this.calendar.insertEvent(userId, input);
          eventId = res.eventId;
        }
        await this.persist(userId, session.id, {
          provider: 'google',
          eventId,
          syncedAt: new Date().toISOString(),
          syncState: 'synced',
        });
        synced += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `Calendar sync failed for session ${session.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await this.persist(userId, session.id, {
          provider: 'google',
          eventId: existingEventId,
          syncedAt: null,
          syncState: 'failed',
        }).catch(() => undefined);
      }
    }

    return { synced, failed };
  }

  private persist(
    userId: string,
    plannedSessionId: string,
    calendarSync: CalendarSync,
  ): Promise<UpdateCalendarSyncResult> {
    return this.commandBus.execute<
      UpdateCalendarSyncCommand,
      UpdateCalendarSyncResult
    >(new UpdateCalendarSyncCommand(userId, plannedSessionId, calendarSync));
  }
}
