import { PreferenceEvent, PreferenceTagType } from './preference-event.model';

/** DI token for the preference-event repository port (DIP). */
export const PREFERENCE_EVENT_REPOSITORY = Symbol('PREFERENCE_EVENT_REPOSITORY');

/**
 * The append-only semantic log. Writes are inserts only (events are immutable);
 * the projection layer reads ranges/slices to distil `user_preferences`.
 */
export interface PreferenceEventRepositoryPort {
  /** Append one event. Returns the store-assigned id. */
  append(event: PreferenceEvent): Promise<string>;

  /** Append a batch (one weekly-revision submit). Returns assigned ids in order. */
  appendMany(events: PreferenceEvent[]): Promise<string[]>;

  /** A single event by id, tenant-scoped. */
  findById(userId: string, eventId: string): Promise<PreferenceEvent | null>;

  /**
   * Most-recent-first events for a user, optionally narrowed by discipline.
   * Powers the "last ~N standing events" generation slice.
   */
  findRecent(
    userId: string,
    opts?: { discipline?: EventDisciplineFilter; limit?: number },
  ): Promise<PreferenceEvent[]>;

  /** All events sharing a batch id — replay one weekly-revision submit. */
  findByBatch(userId: string, batchId: string): Promise<PreferenceEvent[]>;

  /**
   * Active one-off events (not yet expired as of `nowIso`) for a discipline,
   * including cross-cutting (discipline = null) ones. These never enter the
   * projection but steer near-term generation. Most-recent-first.
   */
  findActiveOneOffs(
    userId: string,
    discipline: EventDisciplineFilter,
    nowIso: string,
  ): Promise<PreferenceEvent[]>;

  /**
   * The last `limit` standing events for a discipline (plus cross-cutting),
   * newest-first — the raw recent signal the generator reads alongside the
   * distilled projection.
   */
  findRecentStanding(
    userId: string,
    discipline: EventDisciplineFilter,
    limit: number,
  ): Promise<PreferenceEvent[]>;

  /** Events carrying a given tag type (structured tag filter). */
  findByTagType(
    userId: string,
    tagType: PreferenceTagType,
  ): Promise<PreferenceEvent[]>;

  /**
   * Whole log for a user (oldest-first), optionally for one discipline. Used by
   * the projection rebuild — replaying the log reconstructs `user_preferences`.
   */
  findAllForReplay(
    userId: string,
    discipline?: EventDisciplineFilter,
  ): Promise<PreferenceEvent[]>;
}

/** `null` matches cross-cutting events; omit to match every discipline. */
export type EventDisciplineFilter = PreferenceEvent['discipline'];
