import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import {
  StartConversationCommand,
  StartConversationResult,
} from './start-conversation.command';

@CommandHandler(StartConversationCommand)
export class StartConversationHandler
  implements ICommandHandler<StartConversationCommand, StartConversationResult>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(
    command: StartConversationCommand,
  ): Promise<StartConversationResult> {
    const conversation = await this.repository.createConversation(
      command.userId,
      command.title,
      command.opts,
    );
    return { conversationId: conversation.id };
  }
}
