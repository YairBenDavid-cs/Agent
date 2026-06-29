import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CaptureChatPreferencesCommand } from '../../personalization/application/commands/capture-chat-preferences.command';
import { IngestResult } from '../../personalization/application/services/preference-ingestion.service';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../conversation/domain/conversation.repository.port';
import { FlushConversationPreferencesCommand } from './flush-conversation-preferences.command';
import { PreferenceDistillationService } from './preference-distillation.service';

const EMPTY: IngestResult = { batchId: null, eventIds: [], constraintIds: [] };

@CommandHandler(FlushConversationPreferencesCommand)
export class FlushConversationPreferencesHandler
  implements ICommandHandler<FlushConversationPreferencesCommand, IngestResult>
{
  private readonly logger = new Logger(
    FlushConversationPreferencesHandler.name,
  );

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepositoryPort,
    private readonly distillation: PreferenceDistillationService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(
    command: FlushConversationPreferencesCommand,
  ): Promise<IngestResult> {
    const { userId, conversationId, runId, discipline, today } = command;

    const conversation = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    const candidates = conversation?.pendingCandidates ?? [];
    if (candidates.length === 0) {
      return EMPTY;
    }

    const items = await this.distillation.distill({
      userId,
      runId,
      candidates,
      discipline,
      today,
    });

    // Distillation collapsed everything to nothing (full cancel-out): clear the
    // buffer and skip the write — there is no net intent to persist.
    if (items.length === 0) {
      await this.conversations.clearPendingCandidates(userId, conversationId);
      return EMPTY;
    }

    const result = await this.commandBus.execute<
      CaptureChatPreferencesCommand,
      IngestResult
    >(new CaptureChatPreferencesCommand(userId, items));

    // Clear only AFTER the durable write succeeds, so a mid-flush failure leaves
    // the candidates staged for a retry rather than silently losing intent.
    await this.conversations.clearPendingCandidates(userId, conversationId);

    this.logger.log(
      `Flushed ${candidates.length} candidate(s) → ${result.eventIds.length} chat event(s) for conversation ${conversationId}.`,
    );
    return result;
  }
}
