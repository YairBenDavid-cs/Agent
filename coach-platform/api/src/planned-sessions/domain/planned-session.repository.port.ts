import {
  CalendarSync,
  PlannedOutcome,
  PlannedSession,
  SessionDiff,
} from './planned-session.model';

/** DI token for the planned-session repository port (DIP). */
export const PLANNED_SESSION_REPOSITORY = Symbol('PLANNED_SESSION_REPOSITORY');

/** The Planner-owned schedule fields written onto a tentative train. */
export interface SessionSchedule {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  scheduledStartUtc: string;
}

/** The prescription fields of a train, independent of its schedule/outcome. */
export type SessionContent = Pick<
  PlannedSession,
  'title' | 'estDurationMin' | 'intensityLabel' | 'coachNotes' | 'running' | 'strength'
>;

export interface PlannedSessionRepositoryPort {
  /**
   * Replace one program week's tentative draft in place, keyed on the unique
   * `{program_id, week_index, slot_key}`. Overwrites existing tentative slots
   * (preserving their `_id`), inserts new ones, and drops tentative slots the
   * re-plan omits. Committed / outcome-bearing slots are never touched. Returns
   * the number of slots written.
   */
  replaceTentativeWeek(sessions: PlannedSession[]): Promise<number>;

  /** Calendar / card view: a user's trains across a closed local date range. */
  findByDateRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<PlannedSession[]>;

  /** All trains of one program week, in scheduled order. */
  findByWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<PlannedSession[]>;

  /** Planned, not-yet-resolved trains scheduled on/before `date` (nudge scan). */
  findPastDuePlanned(
    userId: string,
    onOrBeforeDate: string,
  ): Promise<PlannedSession[]>;

  /**
   * Candidate plans the matcher can attach an actual session to: same user,
   * same type, still `planned`, within a date window. Newest schedule first.
   */
  findMatchCandidates(
    userId: string,
    type: PlannedSession['type'],
    fromDate: string,
    toDate: string,
  ): Promise<PlannedSession[]>;

  findById(userId: string, plannedSessionId: string): Promise<PlannedSession | null>;

  /**
   * Per-session commit (chat-originated edit path): flip a single train to
   * `committed` and persist its display `lastDiff`. Unlike `commitWeek`, this
   * targets one session — the iterative flow commits each session as it is
   * finalized rather than approving a whole week. Idempotent on plan_state.
   */
  commitSession(
    userId: string,
    plannedSessionId: string,
    lastDiff: SessionDiff,
  ): Promise<void>;

  /** Set the adherence outcome on a single train. */
  updateOutcome(
    userId: string,
    plannedSessionId: string,
    outcome: PlannedOutcome,
  ): Promise<void>;

  /**
   * Approval commit: flip every still-`tentative` train of one program week to
   * `committed`. Idempotent — re-running once the week is committed flips nothing
   * (already-committed and outcome-bearing trains are untouched). Returns the
   * number actually flipped this call.
   */
  commitWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<number>;

  /**
   * Reject / draft-expiry: drop every still-`tentative` train of one program
   * week. Committed and outcome-bearing trains are untouched. Returns the number
   * deleted. Used when the user rejects a regenerated week (a committed fallback
   * exists) or when a user-initiated draft lapses past its TTL.
   */
  discardTentativeWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<number>;

  /** Write the Planner-owned schedule fields onto a single train. */
  updateSchedule(
    userId: string,
    plannedSessionId: string,
    schedule: SessionSchedule,
  ): Promise<void>;

  /**
   * Overwrite the prescription fields of one train (content edit), independent
   * of its `planState`, and persist the display diff. Never touches
   * `schedule`/`outcome`/`calendarSync` — the content-edit sibling of
   * `updateSchedule`.
   */
  updateContent(
    userId: string,
    plannedSessionId: string,
    content: SessionContent,
    lastDiff: SessionDiff,
  ): Promise<void>;

  /** Set the calendar-sync projection state (used at commit-time sync). */
  updateCalendarSync(
    userId: string,
    plannedSessionId: string,
    calendarSync: CalendarSync,
  ): Promise<void>;
}
