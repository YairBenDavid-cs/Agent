import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  IngestResult,
  PreferenceIngestionService,
} from '../services/preference-ingestion.service';
import { CaptureAssistantPreferenceCommand } from './capture-assistant-preference.command';

@CommandHandler(CaptureAssistantPreferenceCommand)
export class CaptureAssistantPreferenceHandler
  implements ICommandHandler<CaptureAssistantPreferenceCommand, IngestResult>
{
  constructor(private readonly ingestion: PreferenceIngestionService) {}

  async execute(
    command: CaptureAssistantPreferenceCommand,
  ): Promise<IngestResult> {
    return this.ingestion.ingest(
      command.userId,
      'chat',
      [command.item],
      false, // single capture — no batch
    );
  }
}
