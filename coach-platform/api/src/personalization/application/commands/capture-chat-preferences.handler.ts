import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  IngestResult,
  PreferenceIngestionService,
} from '../services/preference-ingestion.service';
import { CaptureChatPreferencesCommand } from './capture-chat-preferences.command';

@CommandHandler(CaptureChatPreferencesCommand)
export class CaptureChatPreferencesHandler
  implements ICommandHandler<CaptureChatPreferencesCommand, IngestResult>
{
  constructor(private readonly ingestion: PreferenceIngestionService) {}

  async execute(
    command: CaptureChatPreferencesCommand,
  ): Promise<IngestResult> {
    return this.ingestion.ingest(
      command.userId,
      'chat',
      command.items,
      true, // action-point flush — one shared batch, one projection rebuild
    );
  }
}
