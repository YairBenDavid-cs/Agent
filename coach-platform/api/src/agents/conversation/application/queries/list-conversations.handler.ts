import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Conversation } from '../../domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
  Page,
} from '../../domain/conversation.repository.port';
import { ListConversationsQuery } from './list-conversations.query';

@QueryHandler(ListConversationsQuery)
export class ListConversationsHandler
  implements IQueryHandler<ListConversationsQuery, Page<Conversation>>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  async execute(query: ListConversationsQuery): Promise<Page<Conversation>> {
    return this.repository.listConversations(query.userId, {
      cursor: query.cursor,
      limit: Math.min(Math.max(query.limit, 1), 100),
    });
  }
}
