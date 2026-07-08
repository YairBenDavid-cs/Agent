import { GarminSyncMode, GarminSyncSchedule } from './garmin-sync-schedule.model';

export const GARMIN_SYNC_SCHEDULE_REPOSITORY = Symbol(
  'GARMIN_SYNC_SCHEDULE_REPOSITORY',
);

export interface UpsertGarminSyncScheduleInput {
  userId: string;
  syncTimesLocal: string[];
  mode: GarminSyncMode;
  enabled: boolean;
}

/**
 * Persistence for the per-user Garmin sync schedule. One doc per user; reads
 * fall back to `DEFAULT_GARMIN_SYNC_SCHEDULE` at the query-handler layer, not
 * here — this port only reflects what has actually been saved.
 */
export interface GarminSyncScheduleRepositoryPort {
  findByUserId(userId: string): Promise<GarminSyncSchedule | null>;

  /** Create or fully replace the user's schedule (times + mode + enabled). */
  upsert(input: UpsertGarminSyncScheduleInput): Promise<GarminSyncSchedule>;

  /** Record that `timeLocal` fired for `localDate`, guarding same-day re-fire. */
  markFired(
    userId: string,
    timeLocal: string,
    localDate: string,
  ): Promise<void>;
}
