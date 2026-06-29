import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../../common/errors/api-error';
import { Conversation } from '../../domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { UpdateConversationTitleCommand } from './update-title.command';

@CommandHandler(UpdateConversationTitleCommand)
export class UpdateConversationTitleHandler
  implements ICommandHandler<UpdateConversationTitleCommand, Conversation>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(
    command: UpdateConversationTitleCommand,
  ): Promise<Conversation> {
    const updated = await this.repository.updateTitle(
      command.userId,
      command.conversationId,
      command.title,
    );
    if (!updated) {
      throw ApiError.notFound('Conversation not found.', {
        conversationId: command.conversationId,
      });
    }
    return updated;
  }
}
