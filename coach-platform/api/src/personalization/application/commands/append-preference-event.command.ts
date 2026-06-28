import { AppendPreferenceEventDto } from '../dto/append-preference-event.dto';

/** Append one already-tagged event to the append-only semantic log. */
export class AppendPreferenceEventCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: AppendPreferenceEventDto,
  ) {}
}
