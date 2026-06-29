import { PlannedSession } from '../../domain/planned-session.model';

/**
 * Replace one program week's tentative draft. The Coach's `upsert_week_sessions`
 * terminal tool writes through this. Sessions arrive fully-formed (always
 * `planState: 'tentative'`, always with `coachNotes`); keyed on the unique
 * `{program_id, week_index, slot_key}`, a re-plan overwrites the existing
 * tentative slots in place and drops the ones it omits, while committed /
 * outcome-bearing slots are left untouched.
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
  written: number;
  requested: number;
}
