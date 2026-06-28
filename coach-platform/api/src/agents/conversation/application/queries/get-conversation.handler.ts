import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ApiError } from '../../../../common/errors/api-error';
import { Conversation } from '../../domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { GetConversationQuery } from './get-conversation.query';

@QueryHandler(GetConversationQuery)
export class GetConversationHandler
  implements IQueryHandler<GetConversationQuery, Conversation>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(query: GetConversationQuery): Promise<Conversation> {
    const conversation = await this.repository.findConversation(
      query.userId,
      query.conversationId,
    );
    if (!conversation) {
      throw ApiError.notFound('Conversation not found.', {
        conversationId: query.conversationId,
      });
    }
    return conversation;
  }
}
