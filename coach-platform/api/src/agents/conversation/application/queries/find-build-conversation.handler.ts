import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Conversation } from '../../domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../../domain/conversation.repository.port';
import { FindBuildConversationQuery } from './find-build-conversation.query';

@QueryHandler(FindBuildConversationQuery)
export class FindBuildConversationHandler
  implements IQueryHandler<FindBuildConversationQuery, Conversation | null>
{
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
  ) {}

  execute(query: FindBuildConversationQuery): Promise<Conversation | null> {
    return this.repository.findOpenBuildConversation(query.userId);
  }
}
