import { EventDiscipline } from '../../domain/preference-event.model';

/**
 * Rebuild the `user_preferences` projection by replaying the event log. Omit
 * `discipline` to rebuild both. Fired synchronously after a batch of events is
 * appended (revision submit / outcome / flush) so reads are immediately fresh.
 */
export class RebuildProjectionCommand {
  constructor(
    public readonly userId: string,
    public readonly discipline?: EventDiscipline,
  ) {}
}
