import { EventDiscipline } from '../../domain/preference-event.model';

/** Read the distilled projection for one discipline (the generation context). */
export class GetUserPreferencesQuery {
  constructor(
    public readonly userId: string,
    public readonly discipline: EventDiscipline,
  ) {}
}
