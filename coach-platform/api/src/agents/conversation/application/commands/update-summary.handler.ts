import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { UpdateConversationSummaryCommand } from './update-summary.command';

@CommandHandler(UpdateConversationSummaryCommand)
export class UpdateConversationSummaryHandler
  implements ICommandHandler<UpdateConversationSummaryCommand, void>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(command: UpdateConversationSummaryCommand): Promise<void> {
    await this.repository.updateSummary(
      command.userId,
      command.conversationId,
      command.summary,
      command.summarizedUpToSeq,
    );
  }
}
