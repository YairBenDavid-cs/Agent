import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Message } from '../../domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
  Page,
} from '../../domain/conversation.repository.port';
import { GetMessagesQuery } from './get-messages.query';

@QueryHandler(GetMessagesQuery)
export class GetMessagesHandler
  implements IQueryHandler<GetMessagesQuery, Page<Message>>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(query: GetMessagesQuery): Promise<Page<Message>> {
    return this.repository.listMessages(query.userId, query.conversationId, {
      cursor: query.cursor,
      limit: Math.min(Math.max(query.limit, 1), 100),
      order: query.order,
    });
  }
}
