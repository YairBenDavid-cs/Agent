import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  IngestResult,
  PreferenceIngestionService,
} from '../services/preference-ingestion.service';
import { FlushSessionPreferencesCommand } from './flush-session-preferences.command';

const EMPTY: IngestResult = { batchId: null, eventIds: [], constraintIds: [] };

@CommandHandler(FlushSessionPreferencesCommand)
export class FlushSessionPreferencesHandler
  implements ICommandHandler<FlushSessionPreferencesCommand, IngestResult>
{
  constructor(private readonly ingestion: PreferenceIngestionService) {}

  async execute(
    command: FlushSessionPreferencesCommand,
  ): Promise<IngestResult> {
    if (command.dto.items.length === 0) {
      return EMPTY; // nothing worth keeping was said this session
    }
    return this.ingestion.ingest(
      command.userId,
      'session_flush',
      command.dto.items,
      true, // batched
    );
  }
}
