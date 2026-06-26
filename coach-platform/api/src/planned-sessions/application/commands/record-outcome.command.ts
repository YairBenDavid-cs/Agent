import { RecordOutcomeDto } from '../dto/record-outcome.dto';

/** Set the adherence outcome on one planned train (matcher or self-report). */
export class RecordOutcomeCommand {
  constructor(
    public readonly userId: string,
    public readonly plannedSessionId: string,
    public readonly dto: RecordOutcomeDto,
  ) {}
}
