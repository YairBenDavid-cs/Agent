import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OpenAiClient } from '../../shared/llm/openai.client';
import { Conversation, Message } from '../domain/conversation.model';
import { UpdateConversationSummaryCommand } from './commands/update-summary.command';

/** Cheap model for summarization — runs only when the budget threshold trips. */
const SUMMARIZER_MODEL = 'gpt-4o-mini';
/** Fraction of the verbatim buffer folded into the summary; newest 30% kept. */
const COMPACT_FRACTION = 0.7;

const SUMMARIZER_PROMPT = `You maintain a running summary of an ongoing coaching chat session. You will be
given the PRIOR summary (may be empty) and the OLDEST messages that are about to
roll out of the verbatim window. Produce a single updated summary that merges
them. Keep it concise but preserve: the user's stated intents, questions asked
and answered, decisions/changes discussed, and any open threads. Do NOT invent
facts. This summary is only for conversational coherence — durable preferences
are already stored elsewhere, so it is safe to drop fine detail. Output only the
updated summary text.`;

export interface CompactionResult {
  summary: string;
  summarizedUpToSeq: number;
  /** Number of messages folded into the summary this run. */
  compacted: number;
}

/**
 * Tier-3 compaction. When the assembler reports the running transcript is near
 * the token budget, fold the OLDEST 70% of the still-verbatim messages into the
 * rolling summary and advance `summarizedUpToSeq`; the newest 30% stay verbatim.
 *
 * Lossy-safe by design: messages are NEVER deleted (the pointer just advances,
 * so the UI/audit keeps the full transcript), and durable signals already live
 * in preference_events — the summary only needs to keep the chat coherent.
 */
@Injectable()
export class ConversationCompactor {
  private readonly logger = new Logger(ConversationCompactor.name);

  constructor(
    private readonly llm: OpenAiClient,
    private readonly commandBus: CommandBus,
  ) {}

  /** True when the LLM is available to summarize; callers no-op compaction otherwise. */
  canCompact(): boolean {
    return this.llm.isConfigured();
  }

  /**
   * Compact `messagesAfterSummary` (ascending by seq) for a conversation.
   * Returns the new summary state, or null when there is nothing to fold or the
   * LLM is unavailable (the caller proceeds with the un-compacted window).
   */
  async compact(
    conversation: Conversation,
    messagesAfterSummary: Message[],
  ): Promise<CompactionResult | null> {
    if (!this.canCompact() || messagesAfterSummary.length < 2) {
      return null;
    }

    const sorted = [...messagesAfterSummary].sort((a, b) => a.seq - b.seq);
    const foldCount = Math.max(1, Math.floor(sorted.length * COMPACT_FRACTION));
    const toFold = sorted.slice(0, foldCount);
    const lastFoldedSeq = toFold[toFold.length - 1].seq;

    const transcript = toFold
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');
    const userBlock = `PRIOR SUMMARY:\n${conversation.summary || '(none)'}\n\nOLDEST MESSAGES TO FOLD IN:\n${transcript}`;

    let summary: string;
    try {
      const completion = await this.llm.complete({
        agentName: 'conversation-summarizer',
        model: SUMMARIZER_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SUMMARIZER_PROMPT },
          { role: 'user', content: userBlock },
        ],
      });
      summary = (completion.message.content ?? '').trim();
    } catch (err) {
      // Never let a summarization failure break the turn — keep the verbatim
      // window and try again next turn.
      this.logger.warn(
        `Compaction failed for ${conversation.id}: ${String(err)} — keeping verbatim window.`,
      );
      return null;
    }

    if (!summary) {
      return null;
    }

    await this.commandBus.execute(
      new UpdateConversationSummaryCommand(
        conversation.userId,
        conversation.id,
        summary,
        lastFoldedSeq,
      ),
    );

    this.logger.log(
      `Compacted ${toFold.length} messages of ${conversation.id} (up to seq ${lastFoldedSeq}).`,
    );
    return { summary, summarizedUpToSeq: lastFoldedSeq, compacted: toFold.length };
  }
}
