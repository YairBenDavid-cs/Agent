import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../../common/errors/api-error';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { DeleteConversationCommand } from './delete-conversation.command';

@CommandHandler(DeleteConversationCommand)
export class DeleteConversationHandler
  implements ICommandHandler<DeleteConversationCommand, void>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(command: DeleteConversationCommand): Promise<void> {
    const deleted = await this.repository.deleteConversation(
      command.userId,
      command.conversationId,
    );
    if (!deleted) {
      throw ApiError.notFound('Conversation not found.', {
        conversationId: command.conversationId,
      });
    }
  }
}
