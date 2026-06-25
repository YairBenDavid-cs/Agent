import { SessionType, WorkoutSession } from './workout-session.model';

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');

export interface SessionsRepositoryPort {
  /** Idempotent upsert keyed on (userId, activityId). */
  upsertSession(session: WorkoutSession): Promise<void>;

  getContentHash(userId: string, activityId: number): Promise<string | null>;

  /** Date range, optionally filtered by type, newest first, cursor-paginated. */
  findRange(
    userId: string,
    from: string,
    to: string,
    type: SessionType | null,
    afterActivityId: number | null,
    limit: number,
  ): Promise<WorkoutSession[]>;
}
