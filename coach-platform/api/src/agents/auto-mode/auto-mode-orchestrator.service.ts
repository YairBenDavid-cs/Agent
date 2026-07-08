import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { PreferenceIngestionService } from '../../personalization/application/services/preference-ingestion.service';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../program/domain/program.repository.port';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../planned-sessions/domain/planned-session.repository.port';
import { AppendMessageCommand } from '../conversation/application/commands/append-message.command';
import { ConversationContextService } from '../conversation/application/conversation-context.service';
import {
  StartConversationCommand,
  StartConversationResult,
} from '../conversation/application/commands/start-conversation.command';
import { AgentToolContext, AnyAgentTool, defineTool } from '../shared/llm/agent-tool';
import { AgenticLoopRuntime } from '../shared/llm/agentic-loop.runtime';
import { ReadToolRegistry } from '../shared/read-tools/read-tool-registry.service';
import { INTERVIEW_PROTOCOL } from '../shared/prompts/interview-protocol.prompt';
import { signalToPreferenceItem } from '../assistant/assistant.mapping';
import { AutoModeExplanationBuilder } from './auto-mode-explanation.builder';
import { AutoModeLockService } from './auto-mode-lock.service';
import { AutoModeGraph } from './auto-mode.graph';
import { AutoModeIntent, autoModeIntentSchema } from './auto-mode.contracts';
import { AutoModeRun, AutoModeScenario, AutoModeTrigger } from './domain/auto-mode-run.model';
import {
  AUTO_MODE_RUN_REPOSITORY,
  AutoModeRunRepositoryPort,
} from './domain/auto-mode-run.repository.port';
import {
  SessionEditRequest,
  SessionTimeEditRequest,
  WeeklyTargetsEditRequest,
} from './auto-mode.state';

const AUTO_MODE_INTENT_PROMPT = `You classify one athlete chat message, sent while a conversation is in
autonomous \`auto\` mode, into an auto-mode edit. You are the ONLY place a
scenario is inferred from prose — once you finalize, the scenario runs
straight through to a guardrailed commit with no further confirmation, so
you must be sure before you finalize.

You have read-tools available: use them to ground which week/session the
athlete means, what today's locked targets/sessions already are, and whether
a matching standing preference already exists (\`get_preference_events\`) —
prefer checking data over asking whenever the data can answer it. You also
see the recent conversation history, so a pending question you asked earlier
carries forward into the athlete's next reply.

${INTERVIEW_PROTOCOL}

Once WHY and LOCAL-vs-GENERAL (and any other real dependency) are grounded,
finalize by picking exactly one scenario: new_week (generate/build next
week), weekly_targets_edit (change session count / volume / focus for the
CURRENT week), session_edit (change one session's content — type, duration,
structure), or session_time_edit (move one session to a different day/time).
Fill only the fields that scenario needs; leave the rest null. \`reason\` is
this classifier's WHY field — it must be the grounded reason, never a generic
restatement of the request.

If, instead, a real dependency is still ungrounded after checking the data,
call emit_intent with \`clarifyingQuestion\` set to ONE open-ended, short
question and leave \`scenario\`/\`reason\` null — do not finalize.

If the athlete confirms this change should ALSO become a standing rule
beyond this run's week-scoped edit (LOCAL-vs-GENERAL resolving to GENERAL),
populate \`standingPreference\` with that signal (including its own
\`rationale\`) in the SAME call that finalizes \`scenario\`.

Call emit_intent exactly once per turn.`;

export interface RunAutoModeInput {
  userId: string;
  programId: string;
  weekIndex: number;
  timezone: string;
  scenario: AutoModeScenario;
  trigger: AutoModeTrigger;
  /** Reuses an existing chat when given; otherwise a fresh auto conversation is opened. */
  conversationId?: string | null;
  weeklyTargetsEditRequest?: WeeklyTargetsEditRequest | null;
  sessionEditRequest?: SessionEditRequest | null;
  sessionTimeEditRequest?: SessionTimeEditRequest | null;
}

export interface RunAutoModeOutcome {
  run: AutoModeRun;
  conversationId: string;
  assistantMessageId: string;
  reply: string;
}

/**
 * The auto-mode entry point: acquires the week's run-lock, snapshots the
 * pre-change state, drives `AutoModeGraph` to completion, and — regardless of
 * whether it committed or aborted — posts the verbose explanation back into
 * chat (hard constraint #4) before releasing the lock. Every caller (chat,
 * the scheduled weekly rollover, the manual-trigger endpoint) goes through
 * this single path, so the lock/audit/explanation behavior never drifts
 * between triggers.
 */
@Injectable()
export class AutoModeOrchestratorService {
  private readonly logger = new Logger(AutoModeOrchestratorService.name);

  constructor(
    private readonly graph: AutoModeGraph,
    private readonly lock: AutoModeLockService,
    private readonly explanation: AutoModeExplanationBuilder,
    private readonly loop: AgenticLoopRuntime,
    private readonly commandBus: CommandBus,
    private readonly conversationContext: ConversationContextService,
    private readonly readTools: ReadToolRegistry,
    private readonly preferenceIngestion: PreferenceIngestionService,
    @Inject(AUTO_MODE_RUN_REPOSITORY)
    private readonly runs: AutoModeRunRepositoryPort,
    @Inject(PROGRAM_REPOSITORY)
    private readonly programs: ProgramRepositoryPort,
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly plannedSessions: PlannedSessionRepositoryPort,
  ) {}

  async runAutoMode(input: RunAutoModeInput): Promise<RunAutoModeOutcome> {
    const program = await this.programs.findById(input.userId, input.programId);
    if (!program) {
      throw new Error(`No program ${input.programId} for user ${input.userId}.`);
    }
    const week = program.weeks.find((w) => w.weekIndex === input.weekIndex);
    if (!week) {
      throw new Error(`Program ${input.programId} has no week ${input.weekIndex}.`);
    }
    const weekWindow = { from: week.startDate, to: week.endDate };
    const discipline = program.discipline as EventDiscipline;

    const conversationId = input.conversationId ?? (await this.openAutoConversation(input));

    const beforeSessions = await this.plannedSessions.findByWeek(
      input.userId,
      input.programId,
      input.weekIndex,
    );
    const run = await this.runs.create({
      userId: input.userId,
      programId: input.programId,
      weekIndex: input.weekIndex,
      scenario: input.scenario,
      trigger: input.trigger,
      conversationId,
      beforeSnapshot: { week, sessions: beforeSessions },
    });

    const acquired = await this.lock.acquire(
      input.userId,
      input.programId,
      input.weekIndex,
      run.id,
    );
    if (!acquired) {
      await this.runs.markFailed(
        run.id,
        `Week ${input.weekIndex} is already locked by another autonomous run or an in-progress build — try again once it finishes.`,
      );
      return this.finalize(input.userId, run.id, conversationId);
    }

    try {
      const finalState = await this.graph.run({
        runId: run.id,
        userId: input.userId,
        programId: input.programId,
        weekIndex: input.weekIndex,
        discipline,
        timezone: input.timezone,
        scenario: input.scenario,
        trigger: input.trigger,
        conversationId,
        weekWindow,
        weeklyTargetsEditRequest: input.weeklyTargetsEditRequest ?? null,
        sessionEditRequest: input.sessionEditRequest ?? null,
        sessionTimeEditRequest: input.sessionTimeEditRequest ?? null,
        recoveryVerdict: null,
        readinessBand: null,
        debateRound: 0,
        guardrailViolations: [],
        trace: [],
        sessionChanges: [],
        diff: {},
        status: 'running',
        abortReason: null,
      });

      for (const entry of finalState.trace) {
        await this.runs.appendTrace(run.id, { node: entry.node, summary: entry.summary });
      }

      if (finalState.status === 'committed') {
        await this.runs.markCommitted(run.id, finalState.diff);
      } else {
        await this.runs.markAborted(
          run.id,
          finalState.abortReason ?? 'Aborted for an unspecified reason.',
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Auto-mode run ${run.id} failed: ${reason}`);
      await this.runs.markFailed(run.id, reason);
    } finally {
      await this.lock.release(input.userId, input.programId, input.weekIndex, run.id);
    }

    return this.finalize(input.userId, run.id, conversationId);
  }

  /**
   * Classifies a free-text chat message (sent while the conversation is in
   * `auto` mode) into a scenario + request, then runs it. This is the only
   * place a scenario is inferred from prose — `AutoModeGraph` itself always
   * receives an explicit scenario.
   *
   * Per the shared INTERVIEW PROTOCOL, the classifier may instead pause with a
   * `clarifyingQuestion`: nothing runs this turn, the question is posted as a
   * plain reply, and the athlete's next message re-enters this method with the
   * question now visible in history, letting the classifier resolve it (or ask
   * up to 4 more) before ever finalizing a scenario.
   */
  async handleChatMessage(
    userId: string,
    conversationId: string,
    message: string,
    opts: { programId: string; weekIndex: number; timezone: string; today: string },
  ): Promise<{ reply: string; assistantMessageId: string }> {
    const intent = await this.classifyIntent(userId, conversationId, message);
    if (!intent) {
      const reply =
        "I couldn't tell which change you meant. Try naming the session, or say " +
        'whether you want next week generated, a target changed, or a session moved.';
      return { reply, assistantMessageId: await this.postPlainReply(userId, conversationId, reply) };
    }

    if (intent.clarifyingQuestion) {
      return {
        reply: intent.clarifyingQuestion,
        assistantMessageId: await this.postPlainReply(
          userId,
          conversationId,
          intent.clarifyingQuestion,
        ),
      };
    }
    // The schema's refine guarantees scenario/reason are set once clarifyingQuestion is null.
    const scenario = intent.scenario as AutoModeScenario;
    const reason = intent.reason as string;

    if (intent.standingPreference) {
      await this.preferenceIngestion.ingest(
        userId,
        'chat',
        [signalToPreferenceItem(intent.standingPreference, opts.today, 'explicit')],
        false,
      );
    }

    const outcome = await this.runAutoMode({
      userId,
      programId: opts.programId,
      weekIndex: opts.weekIndex,
      timezone: opts.timezone,
      scenario,
      trigger: 'chat',
      conversationId,
      weeklyTargetsEditRequest:
        scenario === 'weekly_targets_edit'
          ? {
              sessionCount: intent.sessionCount ?? undefined,
              totalVolume: intent.totalVolume ?? undefined,
              keyGoals: intent.keyGoals ?? undefined,
              reason,
            }
          : null,
      sessionEditRequest:
        scenario === 'session_edit' && intent.plannedSessionId
          ? {
              plannedSessionId: intent.plannedSessionId,
              requestedChangeDescription: intent.requestedChangeDescription ?? message,
            }
          : null,
      sessionTimeEditRequest:
        scenario === 'session_time_edit' && intent.plannedSessionId
          ? {
              plannedSessionId: intent.plannedSessionId,
              requestedDate: intent.requestedDate ?? null,
              requestedStartTime: intent.requestedStartTime ?? null,
            }
          : null,
    });

    return { reply: outcome.reply, assistantMessageId: outcome.assistantMessageId };
  }

  /**
   * Classifies one athlete message into an `AutoModeIntent`, with conversation
   * history (so a pending clarifying question carries forward) and read-tools
   * (so WHY / local-vs-general / target week can be grounded from data rather
   * than guessed or asked when avoidable).
   */
  private async classifyIntent(
    userId: string,
    conversationId: string,
    message: string,
  ): Promise<AutoModeIntent | null> {
    const ctx: AgentToolContext = { userId, runId: randomUUID() };
    const seedMessage = `Athlete message:\n"""\n${message}\n"""\n\nCall emit_intent exactly once.`;
    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId,
      systemPrompt: AUTO_MODE_INTENT_PROMPT,
      seed: '',
      nextUserMessage: message,
    });
    const tools: AnyAgentTool[] = [
      ...this.readTools.all(),
      defineTool<AutoModeIntent, AutoModeIntent>({
        name: 'emit_intent',
        description: 'Emit the classified auto-mode intent. Terminal: ends the run.',
        schema: autoModeIntentSchema,
        terminal: true,
        handler: (args) => Promise.resolve(args),
      }),
    ];
    const result = await this.loop.run<AutoModeIntent>({
      agentName: 'auto-mode-intent',
      systemPrompt: AUTO_MODE_INTENT_PROMPT,
      history,
      seedMessage,
      tools,
      ctx,
      temperature: 0.1,
      coerceTerminalTool: true,
    });
    return result.terminalResult;
  }

  private async openAutoConversation(input: RunAutoModeInput): Promise<string> {
    const title =
      input.scenario === 'new_week'
        ? `Week ${input.weekIndex + 1} — Auto Mode`
        : `Auto Mode — week ${input.weekIndex + 1}`;
    const { conversationId } = await this.commandBus.execute<
      StartConversationCommand,
      StartConversationResult
    >(
      new StartConversationCommand(input.userId, title, {
        mode: 'auto',
        origin: 'system',
        attention: true,
        purpose: null,
      }),
    );
    return conversationId;
  }

  private async postPlainReply(
    userId: string,
    conversationId: string,
    reply: string,
  ): Promise<string> {
    const { message } = await this.commandBus.execute(
      new AppendMessageCommand(userId, conversationId, 'assistant', reply),
    );
    return message.id;
  }

  /** Fetches the completed run, posts its verbose explanation, and returns the outcome. */
  private async finalize(
    userId: string,
    runId: string,
    conversationId: string,
  ): Promise<RunAutoModeOutcome> {
    const run = await this.runs.findByIdScoped(userId, runId);
    if (!run) {
      throw new Error(`Auto-mode run ${runId} vanished before it could be reported.`);
    }
    const reply = this.explanation.build(run);
    const { message } = await this.commandBus.execute(
      new AppendMessageCommand(userId, conversationId, 'assistant', reply, {
        autoModeRunId: run.id,
      }),
    );
    return { run, conversationId, assistantMessageId: message.id, reply };
  }
}
