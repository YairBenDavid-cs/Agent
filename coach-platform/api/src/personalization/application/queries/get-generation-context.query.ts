import { EventDiscipline } from '../../domain/preference-event.model';

/** Assemble the Coach (generator) context slice for one discipline. */
export class GetGenerationContextQuery {
  constructor(
    public readonly userId: string,
    public readonly discipline: EventDiscipline,
  ) {}
}
