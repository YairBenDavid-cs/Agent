import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CaptureAssistantPreferenceCommand } from '../../personalization/application/commands/capture-assistant-preference.command';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { AppendMessageCommand } from '../conversation/application/commands/append-message.command';
import { ConversationContextService } from '../conversation/application/conversation-context.service';
import { AnyAgentTool, defineTool } from '../shared/llm/agent-tool';
import { AgenticLoopRuntime } from '../shared/llm/agentic-loop.runtime';
import { ReadToolRegistry } from '../shared/read-tools/read-tool-registry.service';
import { SeedContextBuilder } from '../shared/seed/seed-context.builder';
import { PipelineRunResult } from '../orchestrator/pipeline.types';
import { PipelineQueue } from '../shared/queue/pipeline-queue.service';
import {
  AssistantLane,
  AssistantTurn,
  assistantTurnSchema,
} from './assistant.contracts';
import { decideActions } from './assistant.decision';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant.prompt';
import { DelegationService } from './delegation';

export interface AssistantTurnOptions {
  /** Active program — keys any pending card batch a fired re-plan produces. */
  programId: string;
  discipline: EventDiscipline;
  /** The current (committed) training week — the firing-boundary reference. */
  weekWindow: { from: string; to: string };
  /** IANA timezone, threaded into any pipeline run the turn fires. */
  timezone: string;
  /** Today's local date (YYYY-MM-DD) for stamping captured preference events. */
  today: string;
}

export interface AssistantTurnOutcome {
  lane: AssistantLane;
  /** The user-facing reply (answer / reflection / clarifying question). */
  reply: string;
  /** How many preference events were eagerly written this turn. */
  capturedCount: number;
  /** True when those writes were inferred + batched (reinforcement only). */
  inferred: boolean;
  /** True when we asked a grounded question and await the user's confirmation. */
  awaitingConfirmation: boolean;
  /** The pipeline result if the turn fired a re-plan now, else null. */
  pipelineRun: PipelineRunResult | null;
  /** The conversation this turn belongs to. */
  conversationId: string;
  /** The persisted assistant-reply message id (for the client to render/link). */
  assistantMessageId: string;
}

/**
 * The chat assistant. One bounded loop per turn: read-tools for factual/aggregate
 * queries (WHITE) and gray-signal investigation, advisory delegation to
 * Coach/Recovery for verdict questions, and a single terminal `assistant_turn`
 * tool that DECLARES the classified result. It holds NO specialist write tools.
 *
 * The deterministic seam lives in `decideActions`: eager-write the structured
 * preference (append-only, never lost) and fire AT MOST ONE pipeline — only when
 * the change touches the week the user is about to train (safety always fires).
 * Implicit/gray signals are written inferred + batched and never re-plan.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly seeds: SeedContextBuilder,
    private readonly readTools: ReadToolRegistry,
    private readonly delegation: DelegationService,
    private readonly commandBus: CommandBus,
    private readonly queue: PipelineQueue,
    private readonly conversationContext: ConversationContextService,
  ) {}

  async handleTurn(
    userId: string,
    conversationId: string,
    runId: string,
    message: string,
    opts: AssistantTurnOptions,
  ): Promise<AssistantTurnOutcome> {
    // 1. Persist the user's message verbatim (tier 2) before anything else, so
    //    the transcript is durable even if reasoning fails downstream.
    await this.commandBus.execute(
      new AppendMessageCommand(userId, conversationId, 'user', message),
    );

    const seed = await this.seeds.buildCoachSeed(userId, opts.discipline);

    // 2. Assemble the tier-3 working memory (rolling summary + recent verbatim),
    //    compacting first if the projected prompt is near the token budget.
    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId,
      systemPrompt: ASSISTANT_SYSTEM_PROMPT,
      seed: seed.seedMessage,
      nextUserMessage: message,
    });

    const tools: AnyAgentTool[] = [
      ...this.readTools.all(),
      ...this.delegation.delegationTools({
        discipline: opts.discipline,
        weekWindow: opts.weekWindow,
      }),
      this.respondTool(),
    ];

    const loopRes = await this.loop.run<AssistantTurn>({
      agentName: 'assistant',
      systemPrompt: ASSISTANT_SYSTEM_PROMPT,
      history,
      seedMessage: `${seed.seedMessage}\n\n== USER MESSAGE ==\n${message}\n\nClassify and respond by calling assistant_turn exactly once.`,
      tools,
      ctx: { userId, runId },
      temperature: 0.3,
    });

    const turn = loopRes.terminalResult;
    if (!turn) {
      // The model answered in free text or the loop exhausted — degrade to a
      // plain reply, write no preference, but DO persist the reply.
      const reply =
        loopRes.finalText ??
        "Sorry, I couldn't process that — could you rephrase?";
      const assistantMessageId = await this.persistReply(
        userId,
        conversationId,
        reply,
        { lane: 'white' },
      );
      return {
        lane: 'white',
        reply,
        capturedCount: 0,
        inferred: false,
        awaitingConfirmation: false,
        pipelineRun: null,
        conversationId,
        assistantMessageId,
      };
    }

    const actions = decideActions(turn, opts.today);

    // Eager preference writes — append-only, OUTSIDE any pipeline lock, so
    // intent is never lost even if the (optional) re-plan is queued behind work.
    for (const item of actions.writes) {
      await this.commandBus.execute(
        new CaptureAssistantPreferenceCommand(userId, item),
      );
    }

    let pipelineRun: PipelineRunResult | null = null;
    if (actions.pipeline) {
      pipelineRun = await this.queue.enqueue({
        pipeline: actions.pipeline,
        ctx: {
          userId,
          runId,
          discipline: opts.discipline,
          timezone: opts.timezone,
          weekWindow: opts.weekWindow,
          weekIndex: seed.currentWeekIndex ?? undefined,
          programId: opts.programId,
          conversationId,
        },
      });
    }

    // 3. Persist the assistant reply with its structured action metadata so the
    //    timeline replays (lane, whether a pipeline fired, pending confirmation).
    const assistantMessageId = await this.persistReply(
      userId,
      conversationId,
      actions.reply,
      {
        lane: actions.lane,
        awaitingConfirmation: actions.awaitingConfirmation,
        ...(pipelineRun ? { pipelineRunId: runId } : {}),
      },
    );

    this.logger.log(
      `Assistant turn ${runId}: lane=${actions.lane} writes=${actions.writes.length} fired=${actions.pipeline ?? 'none'}`,
    );

    return {
      lane: actions.lane,
      reply: actions.reply,
      capturedCount: actions.writes.length,
      inferred: actions.inferred,
      awaitingConfirmation: actions.awaitingConfirmation,
      pipelineRun,
      conversationId,
      assistantMessageId,
    };
  }

  /** Persist the assistant reply (tier 2) and return the new message id. */
  private async persistReply(
    userId: string,
    conversationId: string,
    reply: string,
    meta: import('../conversation/domain/conversation.model').MessageMeta,
  ): Promise<string> {
    const { message } = await this.commandBus.execute(
      new AppendMessageCommand(userId, conversationId, 'assistant', reply, meta),
    );
    return message.id;
  }

  /**
   * The terminal structured-output tool. It performs NO write itself — it just
   * returns the validated classification so `decideActions` (code) can act.
   */
  private respondTool(): AnyAgentTool {
    return defineTool<AssistantTurn, AssistantTurn>({
      name: 'assistant_turn',
      description:
        'Declare the classified turn result (lane + reply + captured signals + optional clarifying question). Terminal: ends the turn.',
      schema: assistantTurnSchema,
      terminal: true,
      handler: (args) => Promise.resolve(args),
    });
  }
}
