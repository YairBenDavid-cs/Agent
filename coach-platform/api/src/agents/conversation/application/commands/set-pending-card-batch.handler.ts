import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { SetPendingCardBatchCommand } from './set-pending-card-batch.command';

@CommandHandler(SetPendingCardBatchCommand)
export class SetPendingCardBatchHandler
  implements ICommandHandler<SetPendingCardBatchCommand, void>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(command: SetPendingCardBatchCommand): Promise<void> {
    await this.repository.setPendingCardBatch(
      command.userId,
      command.conversationId,
      command.cardBatchId,
    );
  }
}
