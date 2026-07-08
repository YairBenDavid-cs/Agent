import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiError } from '../../common/errors/api-error';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { AppendMessageCommand } from '../conversation/application/commands/append-message.command';
import { ConversationContextService } from '../conversation/application/conversation-context.service';
import { ConversationMode } from '../conversation/domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../conversation/domain/conversation.repository.port';
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
import { signalToPendingCandidate } from './assistant.mapping';
import { ASSISTANT_SYSTEM_PROMPT } from './assistant.prompt';
import {
  salvageAssistantTurn,
  stripStructuredArtifacts,
} from './assistant.salvage';
import { DelegationService } from './delegation';
import { BuildConversationOrchestrator } from '../build/build-conversation.orchestrator';
import { AutoModeOrchestratorService } from '../auto-mode/auto-mode-orchestrator.service';

/** Appended to an ASK-mode reply when the user asked for a change we won't make. */
const ASK_MODE_BLOCKED_HINT =
  "\n\n_(You're in Ask mode, so I haven't changed your plan. Switch to Plan mode and I'll make this change.)_";

export interface AssistantTurnOptions {
  /** Active program — keys any pending card batch a fired re-plan produces. */
  programId: string;
  discipline: EventDiscipline;
  /** The current (committed) training week — the firing-boundary reference. */
  weekWindow: { from: string; to: string };
  /** The current week's index — Auto Mode routes to this week. */
  weekIndex: number;
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
  /** True when an ASK-mode turn refused a mutation (client should offer Plan). */
  intentBlocked: boolean;
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
    private readonly buildOrchestrator: BuildConversationOrchestrator,
    private readonly autoModeOrchestrator: AutoModeOrchestratorService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepositoryPort,
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

    // 1a. Build-conversation routing. A `program_build` chat is a deterministic
    //     state machine (propose targets → lock → draft → schedule), not a free
    //     assistant turn — hand it to the orchestrator. A non-null result means
    //     the orchestrator handled (and persisted) the turn; null means the live
    //     phase isn't orchestrated yet, so fall through to the ordinary assistant.
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    if (convo?.purpose === 'program_build') {
      const built = await this.buildOrchestrator.handleTurn({
        userId,
        conversationId,
        message,
        discipline: opts.discipline,
      });
      if (built) {
        return this.buildOutcome(conversationId, built);
      }
    }

    // 1b. Auto-mode routing. A conversation in `auto` mode never runs the
    //     ordinary classify-and-maybe-pipeline loop below — every message is
    //     classified into an AutoModeScenario and handed to the debated,
    //     guardrailed AutoModeGraph instead (hard constraints #1-#4).
    if (convo?.mode === 'auto') {
      const auto = await this.autoModeOrchestrator.handleChatMessage(
        userId,
        conversationId,
        message,
        {
          programId: opts.programId,
          weekIndex: opts.weekIndex,
          timezone: opts.timezone,
        },
      );
      return this.buildOutcome(conversationId, {
        reply: auto.reply,
        assistantMessageId: auto.assistantMessageId,
        awaitingConfirmation: false,
      });
    }

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
      // If the model answers in prose instead of calling assistant_turn, retry
      // once forcing the tool so we get a real structured turn back.
      coerceTerminalTool: true,
    });

    // Prefer the real terminal tool result; otherwise try to salvage a turn the
    // model emulated as JSON-in-prose (recovers reply + captured signals).
    const turn = loopRes.terminalResult ?? salvageAssistantTurn(loopRes.finalText);
    if (!turn) {
      // Truly unstructured output — degrade to a plain reply, write no
      // preference, but DO persist the reply (with any JSON artifacts stripped).
      const reply =
        stripStructuredArtifacts(loopRes.finalText) ||
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
        intentBlocked: false,
        pipelineRun: null,
        conversationId,
        assistantMessageId,
      };
    }

    // Resolve the conversation's mode — ASK forces a read-only turn. Default to
    // `plan` if the record can't be read (back-compat with the prior behavior).
    const mode: ConversationMode =
      (await this.conversations.findConversation(userId, conversationId))?.mode ??
      'plan';

    const actions = decideActions(turn, opts.today, mode);

    // In ASK mode, a mutation request wrote/fired nothing — append a hint that
    // the user must switch to Plan mode for the change to take effect.
    let reply = actions.intentBlocked
      ? `${actions.reply}${ASK_MODE_BLOCKED_HINT}`
      : actions.reply;

    // Plan-mode capture is now STAGED, not written: accumulate the turn's signals
    // into the conversation buffer (append-only) instead of eager-writing a
    // preference event per turn. The durable write happens once, at the action
    // point (week approval), where the buffer is distilled to NET intent and
    // persisted as a single source='chat' batch (decision E). White/clarifying/
    // ASK turns carry no writes, so nothing is staged for them.
    if (mode === 'plan' && actions.writes.length > 0) {
      const capturedAt = new Date().toISOString();
      const candidates = turn.captured.map((s) =>
        signalToPendingCandidate(s, turn.lane as 'black' | 'gray', capturedAt),
      );
      await this.conversations.addPendingCandidates(
        userId,
        conversationId,
        candidates,
      );
    }

    // A confirmed week edit races a `program_build` conversation on the SAME
    // program+week: both write `weekState`/`weeklyTargets` through their own
    // state machine. Rather than risk a torn write, refuse this turn's edit
    // with a clear message — the two flows are never allowed to interleave.
    let firingPipeline = actions.pipeline;
    if (firingPipeline && actions.weekEditContext) {
      const activeBuild = await this.conversations.findOpenBuildConversation(
        userId,
      );
      const racesActiveBuild =
        activeBuild?.buildContext?.programId === opts.programId &&
        activeBuild?.buildContext?.weekIndex === actions.weekEditContext.weekIndex;
      if (racesActiveBuild) {
        firingPipeline = null;
        reply =
          `${reply}\n\n_(Week ${actions.weekEditContext.weekIndex + 1} is still ` +
          'being built in another conversation — finish that first, then ask ' +
          'again.)_';
      }
    }

    let pipelineRun: PipelineRunResult | null = null;
    if (firingPipeline) {
      pipelineRun = await this.queue.enqueue({
        pipeline: firingPipeline,
        ctx: {
          userId,
          runId,
          discipline: opts.discipline,
          timezone: opts.timezone,
          weekWindow: opts.weekWindow,
          // A confirmed week edit names its OWN week explicitly — it must win
          // over the current week, or "change week 4's goal" could only ever
          // touch week 4 when it happens to be the current one.
          weekIndex: actions.weekEditContext?.weekIndex ?? seed.currentWeekIndex ?? undefined,
          programId: opts.programId,
          conversationId,
          ...(actions.weekEditContext?.sessionEdit
            ? { sessionEdit: actions.weekEditContext.sessionEdit }
            : {}),
          ...(actions.weekEditContext?.targetRevision
            ? { targetRevision: actions.weekEditContext.targetRevision }
            : {}),
        },
      });

      // The LLM's `reply` was phrased BEFORE we knew whether the pipeline would
      // actually succeed (it's written in past/done tense per the prompt). If
      // the run aborted, nothing was changed — never let the "Done" reply reach
      // the user; replace it with the real reason so the plan and the chat
      // transcript never disagree about what happened.
      if (pipelineRun?.status === 'aborted') {
        reply =
          `I couldn't make that change: ${pipelineRun.abortReason ?? 'the update failed.'} ` +
          'Nothing on your plan was changed.';
      }
    }

    // 3. Persist the assistant reply with its structured action metadata so the
    //    timeline replays (lane, whether a pipeline fired, pending confirmation).
    const assistantMessageId = await this.persistReply(
      userId,
      conversationId,
      reply,
      {
        lane: actions.lane,
        awaitingConfirmation: actions.awaitingConfirmation,
        ...(pipelineRun ? { pipelineRunId: runId } : {}),
      },
    );

    this.logger.log(
      `Assistant turn ${runId}: mode=${mode} lane=${actions.lane} writes=${actions.writes.length} fired=${firingPipeline ?? 'none'}${actions.intentBlocked ? ' intentBlocked' : ''}`,
    );

    return {
      lane: actions.lane,
      reply,
      capturedCount: actions.writes.length,
      inferred: actions.inferred,
      awaitingConfirmation: actions.awaitingConfirmation,
      intentBlocked: actions.intentBlocked,
      pipelineRun,
      conversationId,
      assistantMessageId,
    };
  }

  /**
   * Map an orchestrator-handled build turn onto the assistant outcome the
   * controller returns. The orchestrator already persisted both the reply and
   * any state transition; this turn captures no preferences and fires no
   * pipeline, so those fields are inert. `awaitingConfirmation` is threaded
   * through so the UI keeps the consent affordance up at a build gate.
   */
  /**
   * Confirm a slot pick on a `program_build` conversation: hands the chosen
   * instant to the orchestrator (re-validate → schedule → calendar write →
   * advance) and shapes the resulting build turn as a normal turn outcome. Throws
   * when the conversation isn't a resolvable build.
   */
  async confirmBuildSlot(
    userId: string,
    conversationId: string,
    scheduledStartUtc: string,
  ): Promise<AssistantTurnOutcome> {
    const built = await this.buildOrchestrator.confirmSlot(
      userId,
      conversationId,
      scheduledStartUtc,
    );
    if (!built) {
      throw ApiError.badRequest(
        'This conversation is not an active program build.',
      );
    }
    return this.buildOutcome(conversationId, built);
  }

  /**
   * Re-greet an in-flight `program_build` conversation on reopen (BW4). Hands off
   * to the orchestrator, which re-derives the phase and only posts when the build
   * sits on an unperformed action step (resume is otherwise free). Returns the
   * turn outcome when a message was posted, or null when nothing was needed / the
   * conversation isn't a build.
   */
  async resumeBuild(
    userId: string,
    conversationId: string,
  ): Promise<AssistantTurnOutcome | null> {
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    if (convo?.purpose !== 'program_build') {
      return null;
    }
    const built = await this.buildOrchestrator.resumeBuild(
      userId,
      conversationId,
    );
    return built ? this.buildOutcome(conversationId, built) : null;
  }

  private buildOutcome(
    conversationId: string,
    built: { reply: string; assistantMessageId: string; awaitingConfirmation: boolean },
  ): AssistantTurnOutcome {
    return {
      lane: 'white',
      reply: built.reply,
      capturedCount: 0,
      inferred: false,
      awaitingConfirmation: built.awaitingConfirmation,
      intentBlocked: false,
      pipelineRun: null,
      conversationId,
      assistantMessageId: built.assistantMessageId,
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
