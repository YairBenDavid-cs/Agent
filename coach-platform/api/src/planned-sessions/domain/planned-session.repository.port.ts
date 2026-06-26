import { PlannedOutcome, PlannedSession } from './planned-session.model';

/** DI token for the planned-session repository port (DIP). */
export const PLANNED_SESSION_REPOSITORY = Symbol('PLANNED_SESSION_REPOSITORY');

export interface PlannedSessionRepositoryPort {
  /**
   * Idempotent bulk insert. The unique index `{program_id, week_index, slot_key}`
   * means re-running the (future) generator over the same week inserts nothing
   * new. Returns the count actually inserted.
   */
  insertMany(sessions: PlannedSession[]): Promise<number>;

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

  /** Set the adherence outcome on a single train. */
  updateOutcome(
    userId: string,
    plannedSessionId: string,
    outcome: PlannedOutcome,
  ): Promise<void>;
}
