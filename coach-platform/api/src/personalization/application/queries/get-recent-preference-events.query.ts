import { EventDisciplineFilter } from '../../domain/preference-event.repository.port';

/**
 * Read raw, most-recent-first preference events (the append-only semantic log)
 * for history/provenance questions an agent or the assistant asks on demand —
 * distinct from the distilled projection (`GetUserPreferencesQuery`).
 */
export class GetRecentPreferenceEventsQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number,
    public readonly discipline?: EventDisciplineFilter,
  ) {}
}
