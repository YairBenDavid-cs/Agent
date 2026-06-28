import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import {
  CONVERSATION_CLOSED,
  ConversationClosedEvent,
} from '../events/conversation-closed.event';
import { CloseConversationCommand } from './close-conversation.command';

@CommandHandler(CloseConversationCommand)
export class CloseConversationHandler
  implements ICommandHandler<CloseConversationCommand, void>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
    private readonly events: EventEmitter2,
  ) {}

  async execute(command: CloseConversationCommand): Promise<void> {
    await this.repository.closeConversation(
      command.userId,
      command.conversationId,
    );
    this.events.emit(
      CONVERSATION_CLOSED,
      new ConversationClosedEvent({
        userId: command.userId,
        conversationId: command.conversationId,
        reason: command.reason,
      }),
    );
  }
}
