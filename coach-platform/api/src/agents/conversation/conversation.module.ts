import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentTelemetryService } from '../shared/llm/agent-telemetry.service';
import { OpenAiClient } from '../shared/llm/openai.client';
import { AppendMessageHandler } from './application/commands/append-message.handler';
import { CloseConversationHandler } from './application/commands/close-conversation.handler';
import { DeleteConversationHandler } from './application/commands/delete-conversation.handler';
import { SetPendingCardBatchHandler } from './application/commands/set-pending-card-batch.handler';
import { StartConversationHandler } from './application/commands/start-conversation.handler';
import { UpdateConversationSummaryHandler } from './application/commands/update-summary.handler';
import { UpdateConversationTitleHandler } from './application/commands/update-title.handler';
import { ConversationContextAssembler } from './application/conversation-context.assembler';
import { ConversationContextService } from './application/conversation-context.service';
import { ConversationCompactor } from './application/conversation-compactor.service';
import { GetConversationHandler } from './application/queries/get-conversation.handler';
import { GetMessagesHandler } from './application/queries/get-messages.handler';
import { ListConversationsHandler } from './application/queries/list-conversations.handler';
import { CONVERSATION_REPOSITORY } from './domain/conversation.repository.port';
import { ConversationRepository } from './infrastructure/conversation.repository';
import {
  ConversationDoc,
  ConversationSchema,
} from './infrastructure/conversation.schema';
import { MessageDoc, MessageSchema } from './infrastructure/message.schema';

const CommandHandlers = [
  StartConversationHandler,
  AppendMessageHandler,
  UpdateConversationSummaryHandler,
  SetPendingCardBatchHandler,
  CloseConversationHandler,
  DeleteConversationHandler,
  UpdateConversationTitleHandler,
];
const QueryHandlers = [
  GetConversationHandler,
  ListConversationsHandler,
  GetMessagesHandler,
];

/**
 * Conversation persistence + tier-3 working memory. Owns the chat transcript
 * (messages, kept forever for UI/audit) and the rolling per-session summary.
 * Provides its own thin OpenAiClient/telemetry instances (stateless wrappers)
 * so it does not depend on AgentsModule — AgentsModule imports THIS module.
 */
@Module({
  imports: [
    CqrsModule,
    MongooseModule.forFeature([
      { name: ConversationDoc.name, schema: ConversationSchema },
      { name: MessageDoc.name, schema: MessageSchema },
    ]),
  ],
  providers: [
    { provide: CONVERSATION_REPOSITORY, useClass: ConversationRepository },
    AgentTelemetryService,
    OpenAiClient,
    ConversationContextAssembler,
    ConversationCompactor,
    ConversationContextService,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [CONVERSATION_REPOSITORY, ConversationContextService],
})
export class ConversationModule {}
