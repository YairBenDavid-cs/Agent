import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../../common/errors/api-error';
import { Conversation } from '../../domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { SetConversationModeCommand } from './set-mode.command';

@CommandHandler(SetConversationModeCommand)
export class SetConversationModeHandler
  implements ICommandHandler<SetConversationModeCommand, Conversation>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(command: SetConversationModeCommand): Promise<Conversation> {
    const updated = await this.repository.setMode(
      command.userId,
      command.conversationId,
      command.mode,
    );
    if (!updated) {
      throw ApiError.notFound('Conversation not found.', {
        conversationId: command.conversationId,
      });
    }
    return updated;
  }
}
