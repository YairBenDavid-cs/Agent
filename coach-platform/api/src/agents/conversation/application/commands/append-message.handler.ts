import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import {
  AppendMessageCommand,
  AppendMessageResult,
} from './append-message.command';

@CommandHandler(AppendMessageCommand)
export class AppendMessageHandler
  implements ICommandHandler<AppendMessageCommand, AppendMessageResult>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(command: AppendMessageCommand): Promise<AppendMessageResult> {
    const message = await this.repository.appendMessage(
      command.userId,
      command.conversationId,
      { role: command.role, content: command.content, meta: command.meta },
    );
    return { message };
  }
}
