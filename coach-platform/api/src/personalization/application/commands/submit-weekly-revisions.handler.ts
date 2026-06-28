import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  IngestResult,
  PreferenceIngestionService,
} from '../services/preference-ingestion.service';
import { SubmitWeeklyRevisionsCommand } from './submit-weekly-revisions.command';

@CommandHandler(SubmitWeeklyRevisionsCommand)
export class SubmitWeeklyRevisionsHandler
  implements ICommandHandler<SubmitWeeklyRevisionsCommand, IngestResult>
{
  constructor(private readonly ingestion: PreferenceIngestionService) {}

  async execute(command: SubmitWeeklyRevisionsCommand): Promise<IngestResult> {
    return this.ingestion.ingest(
      command.userId,
      'revision',
      command.dto.revisions,
      true, // batched — one shared batchId, one rebuild
    );
  }
}
