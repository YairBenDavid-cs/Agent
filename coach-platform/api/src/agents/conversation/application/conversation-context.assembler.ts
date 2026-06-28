import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../../shared/llm/llm.types';
import { Message } from '../domain/conversation.model';

/**
 * Token budget for a chat turn. gpt-4o has a 128k window, but we keep a tight
 * WORKING window for cost/latency/focus and compact before we approach it.
 *
 *   projected prompt = system + seed + summary + recent verbatim + next user msg
 *   compaction trips when projected > WORKING_BUDGET − R_OUT − SAFETY
 *
 * Numbers are the locked defaults (40k working window) from the design.
 */
export const TOKEN_BUDGET = {
  WORKING: 40_000,
  /** Reserved for the model's reply. */
  OUTPUT: 3_000,
  /** Cap on a single incoming user message (trimmed beyond this upstream). */
  USER: 2_000,
  /** ~10% headroom so the estimate never overflows the real tokenizer. */
  SAFETY: 4_000,
} as const;

export interface AssembleInput {
  systemPrompt: string;
  seed: string;
  /** The rolling summary (tier 3); '' when nothing has been compacted yet. */
  summary: string;
  /** Verbatim messages after `summarizedUpToSeq`, ascending by seq. */
  recentMessages: Message[];
  nextUserMessage: string;
}

export interface AssembleResult {
  /** The history block threaded between the system prompt and the seed+message. */
  history: LlmMessage[];
  projectedTokens: number;
  /** True when the projected prompt would exceed the safe threshold. */
  needsCompaction: boolean;
}

/**
 * Builds the conversation history block the assistant loop prepends, and reports
 * whether the running transcript should be compacted first. Pure + cheap: token
 * counting uses a ~4-chars-per-token estimate (kept conservative by SAFETY) so
 * we carry no tokenizer dependency; the estimate only has to be good enough to
 * decide WHEN to summarize.
 */
@Injectable()
export class ConversationContextAssembler {
  /** Conservative ~4 chars/token estimate plus a small per-message overhead. */
  estimateTokens(text: string): number {
    return Math.ceil((text?.length ?? 0) / 4);
  }

  assemble(input: AssembleInput): AssembleResult {
    const history: LlmMessage[] = [];
    if (input.summary.trim().length > 0) {
      history.push({
        role: 'system',
        content: `Conversation so far (running summary of THIS session):\n${input.summary}`,
      });
    }
    for (const msg of input.recentMessages) {
      history.push({ role: msg.role, content: msg.content });
    }

    const PER_MSG_OVERHEAD = 4; // role tokens / formatting, per message.
    const projectedTokens =
      this.estimateTokens(input.systemPrompt) +
      this.estimateTokens(input.seed) +
      this.estimateTokens(input.summary) +
      input.recentMessages.reduce(
        (sum, m) => sum + this.estimateTokens(m.content) + PER_MSG_OVERHEAD,
        0,
      ) +
      this.estimateTokens(input.nextUserMessage);

    const threshold = TOKEN_BUDGET.WORKING - TOKEN_BUDGET.OUTPUT - TOKEN_BUDGET.SAFETY;
    return {
      history,
      projectedTokens,
      needsCompaction: projectedTokens > threshold,
    };
  }
}
