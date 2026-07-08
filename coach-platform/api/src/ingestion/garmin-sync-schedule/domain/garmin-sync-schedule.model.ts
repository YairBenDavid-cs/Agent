/**
 * Per-user configuration for the recurring Garmin sync — the "Scheduled"
 * settings surface for HOW OFTEN and WHEN a tenant's Garmin data is pulled,
 * and what happens when the pull surfaces a change worth reacting to.
 *
 * Mirrors `ScheduledWeekBuild`'s role: agent-layer/ingestion bookkeeping, not
 * a domain resource. One doc per user (upserted), not a queue of one-shot
 * tasks.
 */

/**
 * `plan`  = propose. A sync that surfaces a real change opens a system
 *           conversation with the recommendation and waits for the user to
 *           approve/reject (the existing HITL card-batch flow).
 * `auto`  = apply. The change is committed immediately; the conversation that
 *           opens afterward explains what changed rather than asking first.
 */
export type GarminSyncMode = 'plan' | 'auto';

/** Max number of daily sync times a user may configure. */
export const MAX_GARMIN_SYNC_TIMES = 3;

export interface GarminSyncSchedule {
  userId: string;
  /** Local "HH:mm" times (the user's own timezone), 1-3 entries, deduped. */
  syncTimesLocal: string[];
  mode: GarminSyncMode;
  enabled: boolean;
  /**
   * Fire-once-per-day-per-slot guard: `syncTimesLocal` entry -> the local
   * calendar date (YYYY-MM-DD) it last fired on. Cleared implicitly by the
   * date no longer matching "today" — no separate reset job needed.
   */
  lastFiredAt: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** The schedule new users implicitly have until they save their own. */
export const DEFAULT_GARMIN_SYNC_SCHEDULE: Omit<
  GarminSyncSchedule,
  'userId' | 'createdAt' | 'updatedAt'
> = {
  syncTimesLocal: ['04:00'],
  mode: 'plan',
  enabled: true,
  lastFiredAt: {},
};
