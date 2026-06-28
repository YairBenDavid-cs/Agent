import { SessionSchedule } from '../../domain/planned-session.repository.port';

/**
 * Write the Planner-owned schedule fields (date/time/tz + derived UTC instant)
 * onto a single tentative planned train. The Planner's placement loop writes
 * through this once its pre-write validator clears the slot. App-side only — the
 * real Google Calendar event is created later, at commit.
 */
export class UpsertSessionScheduleCommand {
  constructor(
    public readonly userId: string,
    public readonly plannedSessionId: string,
    public readonly schedule: SessionSchedule,
  ) {}
}

export interface UpsertSessionScheduleResult {
  scheduled: true;
}
