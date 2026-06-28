import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { FlushSessionPreferencesCommand } from '../../personalization/application/commands/flush-session-preferences.command';
import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { AnyAgentTool, defineTool } from '../shared/llm/agent-tool';
import { AgenticLoopRuntime } from '../shared/llm/agentic-loop.runtime';
import { capturedSignalSchema } from '../assistant/assistant.contracts';
import { dedupeFlushSignals } from './session-flush.policy';

// The flush extraction needs neither the current-week flag nor read-tools — it
// only mines the just-ended conversation for durable hints.
const flushSignalSchema = capturedSignalSchema.omit({ affectsCurrentWeek: true });
const flushExtractionSchema = z.object({
  signals: z.array(flushSignalSchema).default([]),
});
type FlushExtraction = z.infer<typeof flushExtractionSchema>;

const FLUSH_SYSTEM_PROMPT = `You are the durable-memory extractor. At the end of a chat session, scan the
conversation for NEW, durable preference signals the user expressed only softly
or in passing — dislikes, recurring friction, standing preferences — that were
NOT already stated as explicit orders. Emit them as INFERRED signals; they need
reinforcement over time before they change the plan, so do not over-claim.
Ignore one-off small talk and anything already acted on. Call emit_signals
exactly once (an empty list is valid).`;

export interface SessionFlushOptions {
  /** The transcript (or distilled notes) of the just-ended conversation. */
  conversation: string;
  /** Identity keys of signals already eager-written explicitly this session. */
  alreadyCapturedKeys: string[];
  /** Today's local date (YYYY-MM-DD) for stamping the events. */
  today: string;
}

/**
 * The `session_flush` trigger — OpenClaw-style "flush before you forget".
 * Extracts inferred signals from the just-ended conversation, dedupes them
 * against what was already explicitly captured this session (so a black signal
 * is never re-appended as an inferred duplicate), and writes them as ONE
 * session_flush batch (confidence=inferred). Effect = write + projection rebuild
 * only (pipeline 6) — never an immediate re-plan; reinforcement does that later.
 */
@Injectable()
export class SessionFlushTrigger {
  private readonly logger = new Logger(SessionFlushTrigger.name);

  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly commandBus: CommandBus,
  ) {}

  async flush(
    userId: string,
    runId: string,
    opts: SessionFlushOptions,
  ): Promise<{ written: number }> {
    const tools: AnyAgentTool[] = [this.emitSignalsTool()];

    const res = await this.loop.run<FlushExtraction>({
      agentName: 'session-flush',
      systemPrompt: FLUSH_SYSTEM_PROMPT,
      seedMessage: `== CONVERSATION ==\n${opts.conversation}\n\nExtract NEW inferred signals and call emit_signals exactly once.`,
      tools,
      ctx: { userId, runId },
      temperature: 0.2,
    });

    const extraction = res.terminalResult;
    if (!extraction || extraction.signals.length === 0) {
      return { written: 0 };
    }

    const items = extraction.signals.map((s) => this.toItem(s, opts.today));
    const deduped = dedupeFlushSignals(items, opts.alreadyCapturedKeys);
    if (deduped.length === 0) {
      return { written: 0 };
    }

    await this.commandBus.execute(
      new FlushSessionPreferencesCommand(userId, { items: deduped }),
    );
    this.logger.log(
      `Session flush ${runId}: wrote ${deduped.length} inferred signal(s).`,
    );
    return { written: deduped.length };
  }

  private toItem(
    s: z.infer<typeof flushSignalSchema>,
    today: string,
  ): PreferenceItemDto {
    const target =
      s.target &&
      (s.target.plannedSessionId || s.target.exerciseId || s.target.runType)
        ? {
            plannedSessionId: s.target.plannedSessionId ?? null,
            exerciseId: s.target.exerciseId ?? null,
            runType: s.target.runType ?? null,
          }
        : null;
    return {
      eventDate: today,
      discipline: s.discipline,
      scope: s.scope,
      durability: s.durability,
      expiresAt: null,
      target,
      tag: {
        type: s.tagType,
        value: s.value,
        polarity: s.polarity,
        confidence: 'inferred', // flush always writes inferred — reinforcement only.
      },
      rawText: s.rawText,
    };
  }

  private emitSignalsTool(): AnyAgentTool {
    return defineTool<FlushExtraction, FlushExtraction>({
      name: 'emit_signals',
      description:
        'Emit the extracted inferred signals (possibly empty). Terminal: ends the run. Performs no write itself.',
      schema: flushExtractionSchema,
      terminal: true,
      handler: (args) => Promise.resolve(args),
    });
  }
}
