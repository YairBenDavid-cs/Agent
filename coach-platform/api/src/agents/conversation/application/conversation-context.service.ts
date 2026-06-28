import { Inject, Injectable } from '@nestjs/common';
import { LlmMessage } from '../../shared/llm/llm.types';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../domain/conversation.repository.port';
import { ConversationContextAssembler } from './conversation-context.assembler';
import { ConversationCompactor } from './conversation-compactor.service';

export interface ContextRequest {
  userId: string;
  conversationId: string;
  systemPrompt: string;
  seed: string;
  nextUserMessage: string;
}

/**
 * The tier-3 working-memory seam the assistant calls each turn: load the rolling
 * summary + the verbatim window, compact if the projected prompt is near the
 * token budget, and return the assembled history block to thread into the loop.
 * Keeps all budget/compaction concerns out of the assistant.
 */
@Injectable()
export class ConversationContextService {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: ConversationRepositoryPort,
    private readonly assembler: ConversationContextAssembler,
    private readonly compactor: ConversationCompactor,
  ) {}

  async buildHistory(req: ContextRequest): Promise<LlmMessage[]> {
    const conversation = await this.repository.findConversation(
      req.userId,
      req.conversationId,
    );
    if (!conversation) {
      return [];
    }

    let summary = conversation.summary;
    let afterSeq = conversation.summarizedUpToSeq;
    let recentMessages = await this.repository.listMessagesAfterSeq(
      req.userId,
      req.conversationId,
      afterSeq,
    );

    let result = this.assembler.assemble({
      systemPrompt: req.systemPrompt,
      seed: req.seed,
      summary,
      recentMessages,
      nextUserMessage: req.nextUserMessage,
    });

    if (result.needsCompaction) {
      const compacted = await this.compactor.compact(
        { ...conversation, summary },
        recentMessages,
      );
      if (compacted) {
        summary = compacted.summary;
        afterSeq = compacted.summarizedUpToSeq;
        recentMessages = await this.repository.listMessagesAfterSeq(
          req.userId,
          req.conversationId,
          afterSeq,
        );
        result = this.assembler.assemble({
          systemPrompt: req.systemPrompt,
          seed: req.seed,
          summary,
          recentMessages,
          nextUserMessage: req.nextUserMessage,
        });
      }
    }

    return result.history;
  }
}
