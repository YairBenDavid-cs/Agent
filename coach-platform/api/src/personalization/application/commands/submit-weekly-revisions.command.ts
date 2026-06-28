import { SubmitWeeklyRevisionsDto } from '../dto/submit-weekly-revisions.dto';

/** Submit a week's worth of card revisions as one batch (source = revision). */
export class SubmitWeeklyRevisionsCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: SubmitWeeklyRevisionsDto,
  ) {}
}
