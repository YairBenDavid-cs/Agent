import { PlannedSession } from '../../domain/planned-session.model';

/**
 * Idempotent bulk insert of one program week's planned trains. The Coach's
 * `upsert_week_sessions` terminal tool writes through this. Sessions arrive
 * fully-formed (always `planState: 'tentative'`, always with `coachNotes`); the
 * unique `{program_id, week_index, slot_key}` index makes a re-run a no-op.
 *
 * Schedule fields are provisional placeholders here — the Planner owns the real
 * `scheduledDate` / times and overwrites them downstream.
 */
export class UpsertWeekSessionsCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
    public readonly sessions: PlannedSession[],
  ) {}
}

export interface UpsertWeekSessionsResult {
  inserted: number;
  requested: number;
}
