import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  CommitSkeletonCommand,
  CommitSkeletonResult,
} from '../../program/application/commands/commit-skeleton.command';
import {
  LockWeeklyTargetsCommand,
  LockWeeklyTargetsResult,
} from '../../program/application/commands/lock-weekly-targets.command';
import {
  ProposeWeeklyTargetsCommand,
  ProposeWeeklyTargetsResult,
} from '../../program/application/commands/propose-weekly-targets.command';
import {
  ReviseWeeklyTargetsCommand,
  ReviseWeeklyTargetsResult,
} from '../../program/application/commands/revise-weekly-targets.command';
import { ProgramWeek } from '../../program/domain/program.model';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../program/domain/program.repository.port';
import {
  UpsertWeekSessionsCommand,
  UpsertWeekSessionsResult,
} from '../../planned-sessions/application/commands/upsert-week-sessions.command';
import {
  UpsertSessionContentCommand,
  UpsertSessionContentResult,
} from '../../planned-sessions/application/commands/upsert-session-content.command';
import {
  PlannedOutcome,
  PlannedSession,
  RunningPlan,
  SessionDiff,
  StrengthPlan,
} from '../../planned-sessions/domain/planned-session.model';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
  SessionContent,
} from '../../planned-sessions/domain/planned-session.repository.port';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { AgentToolContext, AnyAgentTool, defineTool } from '../shared/llm/agent-tool';
import {
  AgenticLoopResult,
  AgenticLoopRuntime,
} from '../shared/llm/agentic-loop.runtime';
import { ReadToolRegistry } from '../shared/read-tools/read-tool-registry.service';
import { CoachSeed, SeedContextBuilder } from '../shared/seed/seed-context.builder';
import {
  CommitSkeletonArgs,
  commitSkeletonSchema,
  DraftSessionArgs,
  draftSessionSchema,
  LockWeeklyTargetsArgs,
  lockWeeklyTargetsSchema,
  PlannedSessionDraft,
  ProposeWeeklyTargetsArgs,
  proposeWeeklyTargetsSchema,
  ReviseSessionContentArgs,
  reviseSessionContentSchema,
  UpsertWeekSessionsArgs,
  upsertWeekSessionsSchema,
} from './coach.contracts';
import {
  detectWeeklyTargetBreach,
  LoadProxyInput,
  ReadinessBand,
  sessionLoadProxy,
  validateAgainstWeeklyTargets,
  validateSessionStructure,
  validateSkeleton,
  validateWeek,
  WeekGuardrailContext,
  WeeklyTargetsCheck,
} from './coach.guardrails';
import { COACH_SYSTEM_PROMPT, INTERVIEW_DOCTRINE } from './coach.prompt';
import { ConversationContextService } from '../conversation/application/conversation-context.service';

/** Inputs the orchestrator hands the Coach to draft the next build session. */
export interface DraftNextSessionOptions {
  programId: string;
  weekIndex: number;
  weekStartDate: string;
  timezone: string;
  /** The week's LOCKED macro budget — the drafted session must fit inside it. */
  targets: { sessionCount: number; totalVolume: number; keyGoals: string[] };
  /** Sessions already committed this week, scored for the quota guardrail. */
  committed: LoadProxyInput[];
  /** slotKeys already taken by committed sessions (collision guard). */
  committedSlotKeys: string[];
  /** The conversation this draft belongs to — threads history into the run. */
  conversationId: string;
  /**
   * The athlete's latest input about this session — an interview answer, a
   * requested change, or post-decline feedback. Controlling input for the draft.
   */
  adjustment?: string;
  /**
   * True on the first turn of a session's step when nothing session-level has
   * been discussed yet (the first session right after targets lock): the coach
   * opens with the interview instead of drafting straight away.
   */
  openWithInterview?: boolean;
}

/** Inputs for composing the LLM-written build welcome message. */
export interface ComposeWelcomeOptions {
  /** 'app' — the very first build (post-onboarding); 'week' — every later week. */
  kind: 'app' | 'week';
  /** Zero-based week index of the build being opened. */
  weekIndex: number;
  /**
   * Deterministic fact lines gathered by the orchestrator (profile snapshot or
   * prior-week adherence). The model must build ONLY on these — no invention.
   */
  facts: string[];
}

/** Options for one weekly generation run. */
export interface GenerateWeekOptions {
  /** Skeleton week to fill. Defaults to the program's currentWeekIndex. */
  weekIndex?: number;
  /** IANA tz snapshot for the placeholder schedule (Planner overwrites). */
  timezone: string;
  /** Latest Recovery Guru band, if a verdict drove this run. */
  readiness?: ReadinessBand | null;
}

/** Inputs the orchestrator hands the Coach to reactively revise one session. */
export interface ReviseSessionContentOptions {
  programId: string;
  weekIndex: number;
  timezone: string;
  plannedSessionId: string;
  /** Plain-language description of what the athlete asked to change. */
  requestedChangeDescription: string;
}

/**
 * The Coach agent. Runs `generateProgram` (skeleton) and `generateWeek`
 * (concrete sessions) as bounded tool-using loops, each pre-seeded with the
 * 8-block coach context so the common case needs zero read-tool calls. Its two
 * terminal tools wrap the post-generation guardrail (validator-bounce on a
 * violation) and write THROUGH the existing CQRS commands — never repositories.
 */
@Injectable()
export class CoachService {
  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly seeds: SeedContextBuilder,
    private readonly readTools: ReadToolRegistry,
    private readonly commandBus: CommandBus,
    @Inject(PROGRAM_REPOSITORY)
    private readonly programs: ProgramRepositoryPort,
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly plannedSessions: PlannedSessionRepositoryPort,
    private readonly conversationContext: ConversationContextService,
  ) {}

  /** Lay down / regenerate the ~12-week periodization skeleton. */
  async generateProgram(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
  ): Promise<AgenticLoopResult<CommitSkeletonResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.commitSkeletonTool(seed.programId),
    ];

    return this.loop.run<CommitSkeletonResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage: `${seed.seedMessage}\n\n== TASK ==\nGenerate the full periodization skeleton for this program. Call commit_program_skeleton exactly once.`,
      tools,
      ctx,
      // A prose answer instead of the terminal tool would abort the whole
      // pipeline — retry once forcing the tool before giving up.
      coerceTerminalTool: true,
    });
  }

  /**
   * Step A of the iterative weekly flow: lock the week's macro budget (session
   * count + native-unit volume + key goals) BEFORE any session is drafted. The
   * locked targets become the quota that Step B's per-session drafting must fit
   * inside (`validateAgainstWeeklyTargets`). Targets are immutable once locked.
   */
  async generateWeeklyTargets(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: { weekIndex?: number; timezone: string },
  ): Promise<AgenticLoopResult<LockWeeklyTargetsResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };
    const targetWeek = opts.weekIndex ?? seed.currentWeekIndex ?? 0;

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.lockWeeklyTargetsTool(seed.programId),
    ];

    return this.loop.run<LockWeeklyTargetsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage: `${seed.seedMessage}\n\n== TASK (Step A — weekly targets) ==\nDecide the macro budget for week index ${targetWeek}: how many sessions, the total native-unit volume (km for running, volume-load for strength), and the key weekly goals. Call lock_weekly_targets exactly once with programId "${seed.programId ?? ''}".`,
      tools,
      ctx,
      // A prose answer instead of the terminal tool would abort the whole
      // pipeline — retry once forcing the tool before giving up.
      coerceTerminalTool: true,
    });
  }

  /**
   * Conversational-build counterpart to Step A: PROPOSE the week's macro budget
   * without locking it. The non-terminal `propose_weekly_targets` tool stages a
   * tentative quota (week stays `open`), then the loop continues so the model
   * composes a short plain-language proposal for the user — returned as
   * `finalText`. The user accepts (→ {@link lockTargets}) or asks to revise.
   */
  async proposeWeeklyTargets(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: {
      weekIndex?: number;
      conversationId: string;
      /**
       * True on the very first turn of the week-planning step (the build
       * kickoff, before the user has said anything): the coach must OPEN the
       * interview — one recommendation-led question, no tool call — so the
       * week is planned WITH the athlete instead of proposed at them.
       */
      openWithInterview?: boolean;
    },
  ): Promise<AgenticLoopResult<ProposeWeeklyTargetsResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };
    const targetWeek = opts.weekIndex ?? seed.currentWeekIndex ?? 0;

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.proposeWeeklyTargetsTool(seed.programId),
    ];

    const sequencing = opts.openWithInterview
      ? `This is the OPENING turn of the week-planning step — do NOT call any ` +
        `tool this turn. Open the interview instead: ask ONE short, open, ` +
        `recommendation-led question about what matters most for this week ` +
        `(their goal for the week, the session mix, or whatever would most ` +
        `change the targets), leading with your data-grounded suggestion so ` +
        `it's easy to just say "yes".`
      : `Propose only once you and the athlete are ALIGNED on this week's ` +
        `direction (from the conversation so far). If you're not aligned yet, ` +
        `continue the interview: ask the ONE next question (with your ` +
        `recommended answer + the data reason) and STOP without calling any ` +
        `tool. Once aligned — or if they told you to just go with your ` +
        `recommendations — call propose_weekly_targets exactly once with ` +
        `programId "${seed.programId ?? ''}", then write a short, warm message ` +
        `(2–4 sentences) proposing this week — name the session count and the ` +
        `main intents — and ask whether it looks good or they'd like to adjust. ` +
        `Do NOT lock anything yet.`;

    const seedMessage =
      `${seed.seedMessage}\n\n${INTERVIEW_DOCTRINE}\n\n` +
      `== TASK (Conversational build — propose week targets) ==\n` +
      `Settle the macro budget for week index ${targetWeek}: how many sessions, ` +
      `the total native-unit volume (km for running, volume-load for strength), ` +
      `and the key weekly goals.\n` +
      sequencing;

    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId: opts.conversationId,
      systemPrompt: COACH_SYSTEM_PROMPT,
      seed: seedMessage,
      nextUserMessage: '',
    });

    return this.loop.run<ProposeWeeklyTargetsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      history,
      seedMessage,
      tools,
      ctx,
    });
  }

  /**
   * Compose the warm, personal welcome that opens a build conversation — an LLM
   * text-only run (no tools, no writes). `kind: 'app'` welcomes the athlete to
   * the app right after onboarding: Popvich introduces itself and the agent
   * team, names what was learned at onboarding (from `facts`), explains that a
   * full program is being built from it, and frames the journey starting NOW
   * with week 1's goals. `kind: 'week'` welcomes them to a later week with a
   * recap. Returns null when the run produced no usable text (caller falls back
   * to deterministic copy).
   */
  async composeWelcome(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: ComposeWelcomeOptions,
  ): Promise<string | null> {
    const ctx: AgentToolContext = { userId, runId };
    const factLines = opts.facts.map((f) => `  • ${f}`).join('\n');

    const task =
      opts.kind === 'app'
        ? `Write the very FIRST message this athlete sees after finishing ` +
          `onboarding — their welcome to the app. Requirements:\n` +
          `- Be genuinely warm and personal; congratulate them on taking the step.\n` +
          `- Introduce yourself as Popvich, their head coach, and briefly mention ` +
          `you work with a small team behind the scenes (a planner that finds ` +
          `training times in their calendar, and a recovery watchdog that keeps ` +
          `an eye on their readiness) — one light sentence, not a feature list.\n` +
          `- Tell them you're building their full training program around what ` +
          `they shared at onboarding — weave the facts below in naturally, as ` +
          `proof you listened, not as a stats dump.\n` +
          `- Explain what happens NOW: the journey starts by setting week 1's ` +
          `goals together, then drafting each session one at a time for their ` +
          `review, then finding calendar times. Make it clear they approve every ` +
          `step.\n` +
          `- End by leading into the first question about their week (do NOT ask ` +
          `it — the next message will).\n` +
          `- 4–7 sentences, plain text, no headings or bullet lists, no emojis.`
        : `Write the opening message for planning week ${opts.weekIndex + 1} — ` +
          `a warm welcome to the NEW week (they already know the app). ` +
          `Requirements:\n` +
          `- Cheer their last week using the recap facts below (be honest — if ` +
          `adherence was low, be encouraging, not fake).\n` +
          `- Frame what happens now: we set this week's goals together, then ` +
          `draft the sessions one at a time.\n` +
          `- End by leading into the first question about the week (do NOT ask ` +
          `it — the next message will).\n` +
          `- 2–5 sentences, plain text, no headings or bullet lists, no emojis.`;

    const res = await this.loop.run({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage:
        `== TASK (Conversational build — welcome message) ==\n${task}\n\n` +
        `Facts you may use (do not invent others):\n${factLines || '  (none)'}\n` +
        `Discipline: ${discipline}.\n` +
        `Do NOT call any tool. Reply with the message text only.`,
      tools: [],
      ctx,
    });
    return res.finalText?.trim() || null;
  }

  /**
   * Compose the follow-up after the athlete DECLINED a drafted-session card
   * without stating a reason — an LLM text-only run (no tools, no writes) with
   * the full conversation history, so the acknowledgment + single clarifying
   * question sounds like Popvich mid-conversation rather than canned copy. The
   * message must ask what they'd like different (the answer drives the
   * redraft). Returns null when the run produced no usable text (caller falls
   * back to deterministic copy).
   */
  async composeDeclineAsk(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: { conversationId: string; declinedTitle: string | null },
  ): Promise<string | null> {
    const ctx: AgentToolContext = { userId, runId };
    const title = opts.declinedTitle ? `"${opts.declinedTitle}"` : 'the drafted session';

    const seedMessage =
      `== TASK (Conversational build — declined session follow-up) ==\n` +
      `The athlete just DECLINED ${title} via the card's Decline button, ` +
      `without saying why. Discipline: ${discipline}.\n` +
      `Write ONE short, warm message that:\n` +
      `- acknowledges you saw them pass on it — no guilt, their call;\n` +
      `- asks ONE open question about what they'd like different (the type of ` +
      `session, its structure, the day it lands on — anything), so you can ` +
      `redraft it around their answer;\n` +
      `- if the conversation so far hints at why they declined, lead with your ` +
      `best guess so it's easy to confirm.\n` +
      `Do NOT redraft anything yet and do NOT call any tool. 1–3 sentences, ` +
      `plain text, no emojis. Reply with the message text only.`;

    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId: opts.conversationId,
      systemPrompt: COACH_SYSTEM_PROMPT,
      seed: seedMessage,
      nextUserMessage: '',
    });

    const res = await this.loop.run({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      history,
      seedMessage,
      tools: [],
      ctx,
    });
    return res.finalText?.trim() || null;
  }

  /**
   * Lock a week's proposed targets on the user's consent. Thin wrapper over the
   * `LockWeeklyTargetsCommand` (no LLM run) — the orchestrator passes the values
   * the user agreed to (read back from the tentative proposal on the week).
   */
  async lockTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: { sessionCount: number; totalVolume: number; keyGoals: string[] },
  ): Promise<LockWeeklyTargetsResult> {
    return this.commandBus.execute<
      LockWeeklyTargetsCommand,
      LockWeeklyTargetsResult
    >(
      new LockWeeklyTargetsCommand(
        userId,
        programId,
        weekIndex,
        targets.sessionCount,
        targets.totalVolume,
        targets.keyGoals,
        new Date().toISOString(),
      ),
    );
  }

  /**
   * Revise a week's already-locked macro budget IN PLACE. Thin wrapper over the
   * `ReviseWeeklyTargetsCommand` (no LLM run) — reachable only from the
   * deterministic orchestrator, after either a direct target-change request or
   * a confirmed session-edit breach. `weekState` is untouched; the prior quota
   * is preserved in `revisionHistory`.
   */
  async reviseWeeklyTargets(
    userId: string,
    programId: string,
    weekIndex: number,
    targets: { sessionCount: number; totalVolume: number; keyGoals: string[] },
    triggeredBy: 'session_edit' | 'direct_target_change',
    reason: string,
  ): Promise<ReviseWeeklyTargetsResult> {
    return this.commandBus.execute<
      ReviseWeeklyTargetsCommand,
      ReviseWeeklyTargetsResult
    >(
      new ReviseWeeklyTargetsCommand(
        userId,
        programId,
        weekIndex,
        targets.sessionCount,
        targets.totalVolume,
        targets.keyGoals,
        reason,
        triggeredBy,
      ),
    );
  }

  /**
   * Resolve the user's response to a tentative targets proposal. The coach reads
   * the proposed quota + the athlete's reply and EITHER locks the targets (they
   * agreed — possibly with a small tweak, applied first) via the terminal
   * `lock_weekly_targets` tool, OR re-proposes a revised quota via the
   * non-terminal `propose_weekly_targets` tool and explains the change
   * (`finalText`), OR — if they want changes but the specifics/why aren't clear
   * yet — asks ONE open interview question and calls no tool at all, same as the
   * initial proposal's interview step. All three are available; the model picks
   * based on intent.
   */
  async resolveTargetsConsent(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: {
      weekIndex: number;
      proposed: { sessionCount: number; totalVolume: number; keyGoals: string[] };
      userMessage: string;
      conversationId: string;
    },
  ): Promise<AgenticLoopResult<LockWeeklyTargetsResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };
    const { sessionCount, totalVolume, keyGoals } = opts.proposed;

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.proposeWeeklyTargetsTool(seed.programId),
      this.lockWeeklyTargetsTool(seed.programId),
    ];

    const seedMessage =
      `${seed.seedMessage}\n\n${INTERVIEW_DOCTRINE}\n\n` +
      `== TASK (Conversational build — targets consent) ==\n` +
      `You previously PROPOSED these week-${opts.weekIndex} targets:\n` +
      `  • sessions: ${sessionCount}\n  • total volume: ${totalVolume}\n` +
      `  • key goals: ${keyGoals.join(', ') || '(none)'}\n\n` +
      `The athlete replied:\n"""${opts.userMessage}"""\n\n` +
      `Decide their intent:\n` +
      `- If they AGREE / approve / say it looks good → call lock_weekly_targets ` +
      `with programId "${seed.programId ?? ''}", weekIndex ${opts.weekIndex}, and ` +
      `the agreed numbers (apply any small tweak they asked for). This finalizes ` +
      `the week's quota.\n` +
      `- If they want CHANGES and you already have enough to act on (their message ` +
      `+ the conversation so far settle it) → call propose_weekly_targets with the ` +
      `revised numbers, then write a short message explaining the update and asking ` +
      `if it now looks good. Do NOT lock in that case.\n` +
      `- If they want changes but a decision-relevant detail is genuinely unknown ` +
      `(what specifically to change, or why) → per the interview style, ask ONE ` +
      `open question (with your recommended answer + the data reason) and STOP ` +
      `without calling any tool. Never ask a clarifying question AND "does this ` +
      `look good" in the same message — only ask for approval once you're ready to ` +
      `call propose_weekly_targets or lock_weekly_targets.`;

    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId: opts.conversationId,
      systemPrompt: COACH_SYSTEM_PROMPT,
      seed: seedMessage,
      nextUserMessage: '',
    });

    return this.loop.run<LockWeeklyTargetsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      history,
      seedMessage,
      tools,
      ctx,
    });
  }

  /** Turn the current skeleton week into concrete tentative sessions. */
  async generateWeek(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: GenerateWeekOptions,
  ): Promise<AgenticLoopResult<UpsertWeekSessionsResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };
    const targetWeek = opts.weekIndex ?? seed.currentWeekIndex ?? 0;

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.upsertWeekSessionsTool(seed, opts.readiness ?? null),
    ];

    const readinessNote =
      opts.readiness && opts.readiness !== 'green'
        ? `\nRecovery Guru band: ${opts.readiness.toUpperCase()} — ease this week per the readiness cap.`
        : '';

    return this.loop.run<UpsertWeekSessionsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage: `${seed.seedMessage}\n\n== TASK ==\nGenerate concrete planned sessions for week index ${targetWeek}, timezone ${opts.timezone}.${readinessNote}\nCall upsert_week_sessions exactly once with programId "${seed.programId ?? ''}".`,
      tools,
      ctx,
      // A prose answer instead of the terminal tool would abort the whole
      // pipeline — retry once forcing the tool before giving up.
      coerceTerminalTool: true,
    });
  }

  /**
   * Conversational build, Step B (per-session): draft EXACTLY ONE tentative
   * session — the next not-yet-committed slot — so the athlete reviews it on its
   * own card before the next is drafted. The single `draft_next_session` terminal
   * tool validates the draft's structure AND that it fits the LOCKED weekly
   * targets given the already-committed sessions (quota guardrail), then persists
   * it tentative. The loop then writes a short plain-language description of the
   * session as `finalText` for the chat.
   */
  async draftNextSession(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: DraftNextSessionOptions,
  ): Promise<AgenticLoopResult<UpsertWeekSessionsResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };
    const programId = seed.programId ?? opts.programId;

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.draftNextSessionTool(opts),
    ];

    const sessionNumber = opts.committed.length + 1;
    const committedList =
      opts.committedSlotKeys.length > 0
        ? opts.committedSlotKeys.join(', ')
        : '(none yet)';
    const goals = opts.targets.keyGoals.join(', ') || '(none specified)';
    const adjustmentNote = opts.adjustment?.trim()
      ? `\nThe athlete's latest message about this session: ` +
        `"${opts.adjustment.trim()}". Treat it as the CONTROLLING input — if it ` +
        `settles the session's shape (or the change they want), act on it; if ` +
        `the what or why is still unclear, interview per the style below.\n`
      : '';

    const sequencing = opts.openWithInterview
      ? `This is the OPENING turn of this session's step and nothing about THIS ` +
        `session has been discussed yet. Unless the athlete already told you to ` +
        `just go with your recommendations, do NOT call any tool this turn — ` +
        `open the interview instead: ask ONE short, open, recommendation-led ` +
        `question about this session (its focus, structure, or whatever would ` +
        `most change it), leading with your data-grounded suggestion.`
      : `Per the interview style: reach a shared understanding of THIS session ` +
        `before drafting — draft only when the conversation so far settles the ` +
        `session's shape, or the athlete told you to just go ahead. If it isn't ` +
        `settled yet, ask ONE question (with your recommended answer + the data ` +
        `reason) and STOP without calling any tool. When you draft: draft ` +
        `EXACTLY ONE new session — the next one — that fits the remaining ` +
        `quota: call draft_next_session exactly once with programId ` +
        `"${programId ?? ''}" and a unique slotKey, then write a short, warm ` +
        `message (2–3 sentences) describing this session to the athlete and ask ` +
        `if it looks good to add. Do not draft more than one session.`;

    const seedMessage =
      `${seed.seedMessage}\n\n${INTERVIEW_DOCTRINE}\n\n` +
      `== TASK (Conversational build — draft session ` +
      `${sessionNumber} of ${opts.targets.sessionCount}) ==\n` +
      `Week index ${opts.weekIndex} (starts ${opts.weekStartDate}, timezone ` +
      `${opts.timezone}). The week's LOCKED targets are:\n` +
      `  • sessions: ${opts.targets.sessionCount}\n` +
      `  • total volume: ${opts.targets.totalVolume}\n` +
      `  • key goals: ${goals}\n` +
      `Already committed slotKeys: ${committedList}.\n` +
      adjustmentNote +
      `\n${sequencing}`;

    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId: opts.conversationId,
      systemPrompt: COACH_SYSTEM_PROMPT,
      seed: seedMessage,
      nextUserMessage: '',
    });

    return this.loop.run<UpsertWeekSessionsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      history,
      seedMessage,
      tools,
      ctx,
    });
  }

  /**
   * Reactive edit (Flow A): rewrite ONE existing session's prescription per an
   * explicit athlete request (e.g. "make Friday's run 15km"). Reachable only
   * from the deterministic orchestrator's `SESSION_CONTENT_REPLAN` pipeline —
   * never a tool the Assistant's own model can call. Re-fetches the target
   * session, its week siblings, and the week's locked targets server-side
   * (defense in depth: never trusts the caller's view of any of these), so the
   * terminal tool's breach check is always against the current committed state.
   */
  async reviseSessionContent(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: ReviseSessionContentOptions,
  ): Promise<AgenticLoopResult<UpsertSessionContentResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };

    const [existing, weekSessions, program] = await Promise.all([
      this.plannedSessions.findById(userId, opts.plannedSessionId),
      this.plannedSessions.findByWeek(userId, opts.programId, opts.weekIndex),
      this.programs.findById(userId, opts.programId),
    ]);
    if (!existing) {
      throw new Error(`Planned session ${opts.plannedSessionId} not found.`);
    }

    const week = program?.weeks.find((w) => w.weekIndex === opts.weekIndex);
    if (week?.weekState === 'locked') {
      throw new Error(
        `Week ${opts.weekIndex} is locked; this is a historical record and cannot be edited.`,
      );
    }
    const targets: WeeklyTargetsCheck | null = week?.weeklyTargets ?? null;
    const fixedOthers: LoadProxyInput[] = weekSessions.filter(
      (s) => s.id !== opts.plannedSessionId,
    );

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.reviseSessionContentTool(opts.plannedSessionId, existing, fixedOthers, targets),
    ];

    const targetsNote = targets
      ? `This week's locked targets: ${targets.sessionCount} sessions, ` +
        `${targets.totalVolume} total volume. Your revised prescription must ` +
        `fit alongside the ${fixedOthers.length} other session(s) already in ` +
        `the week, or the edit will be rejected.\n`
      : '';

    return this.loop.run<UpsertSessionContentResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage:
        `${seed.seedMessage}\n\n== TASK (Reactive edit — revise one session) ==\n` +
        `Week index ${opts.weekIndex}, timezone ${opts.timezone}. The athlete ` +
        `asked to change this session (plannedSessionId "${opts.plannedSessionId}"` +
        `, slotKey "${existing.slotKey}"):\n"""${opts.requestedChangeDescription}"""\n\n` +
        `Current prescription:\n${JSON.stringify(existing, null, 0)}\n\n` +
        targetsNote +
        `Call revise_session_content exactly once with the FULL updated ` +
        `prescription (not just the changed fields) and the list of fields that ` +
        `changed (before/after) for the display diff.`,
      tools,
      ctx,
      // A prose answer instead of the terminal tool would abort the whole
      // pipeline — retry once forcing the tool before giving up.
      coerceTerminalTool: true,
    });
  }

  // ── terminal write tools ──────────────────────────────────────────────────

  private lockWeeklyTargetsTool(programId: string | null): AnyAgentTool {
    return defineTool<LockWeeklyTargetsArgs, LockWeeklyTargetsResult>({
      name: 'lock_weekly_targets',
      description:
        "Lock this week's macro budget (session count + native-unit volume + " +
        'key goals) BEFORE drafting any session. Terminal: ends the run.',
      schema: lockWeeklyTargetsSchema,
      terminal: true,
      handler: async (args, c) => {
        if (!programId) {
          throw new Error('No active program to lock weekly targets on.');
        }
        return this.commandBus.execute<
          LockWeeklyTargetsCommand,
          LockWeeklyTargetsResult
        >(
          new LockWeeklyTargetsCommand(
            c.userId,
            programId,
            args.weekIndex,
            args.sessionCount,
            args.totalVolume,
            args.keyGoals,
            new Date().toISOString(),
          ),
        );
      },
    });
  }

  private proposeWeeklyTargetsTool(programId: string | null): AnyAgentTool {
    return defineTool<ProposeWeeklyTargetsArgs, ProposeWeeklyTargetsResult>({
      name: 'propose_weekly_targets',
      description:
        "Stage a TENTATIVE proposal for this week's macro budget (session " +
        'count + native-unit volume + key goals). Non-terminal: the week stays ' +
        'open and nothing is locked — after calling this, explain the proposal ' +
        'to the athlete in plain language and ask if it looks good.',
      schema: proposeWeeklyTargetsSchema,
      terminal: false,
      handler: async (args, c) => {
        if (!programId) {
          throw new Error('No active program to propose weekly targets on.');
        }
        return this.commandBus.execute<
          ProposeWeeklyTargetsCommand,
          ProposeWeeklyTargetsResult
        >(
          new ProposeWeeklyTargetsCommand(
            c.userId,
            programId,
            args.weekIndex,
            args.sessionCount,
            args.totalVolume,
            args.keyGoals,
          ),
        );
      },
    });
  }

  private draftNextSessionTool(opts: DraftNextSessionOptions): AnyAgentTool {
    return defineTool<DraftSessionArgs, UpsertWeekSessionsResult>({
      name: 'draft_next_session',
      description:
        'Persist ONE tentative session — the next not-yet-committed slot of the ' +
        'week. Terminal: ends the run. Must fit inside the locked weekly targets.',
      schema: draftSessionSchema,
      terminal: true,
      handler: async (args, c) => {
        const violations: string[] = [];

        // Structural detail (real workout, not a title) + locked-quota fit, the
        // proposed session added to the sessions already committed this week.
        violations.push(...validateSessionStructure(args.session));
        violations.push(
          ...validateAgainstWeeklyTargets(
            args.session as LoadProxyInput,
            opts.committed,
            {
              sessionCount: opts.targets.sessionCount,
              totalVolume: opts.targets.totalVolume,
            },
          ),
        );
        // A new draft must not reuse a committed slotKey (would collide on upsert).
        if (opts.committedSlotKeys.includes(args.session.slotKey)) {
          violations.push(
            `slotKey "${args.session.slotKey}" is already committed; pick a new one.`,
          );
        }
        if (violations.length > 0) {
          throw new Error(`Guardrail rejected session: ${violations.join(' ')}`);
        }

        const session = this.toDomainSession(c.userId, args, args.session);
        return this.commandBus.execute<
          UpsertWeekSessionsCommand,
          UpsertWeekSessionsResult
        >(
          new UpsertWeekSessionsCommand(
            c.userId,
            args.programId,
            args.weekIndex,
            [session],
          ),
        );
      },
    });
  }

  /**
   * Terminal tool for {@link reviseSessionContent}. Re-validates structure AND,
   * when the week has locked targets, the projected fit against the OTHER
   * sessions already in the week (`fixedOthers`, fetched server-side) before
   * writing — defense in depth even though the caller should only reach this
   * pipeline once the athlete has already confirmed any breach.
   */
  private reviseSessionContentTool(
    plannedSessionId: string,
    existing: PlannedSession,
    fixedOthers: LoadProxyInput[],
    targets: WeeklyTargetsCheck | null,
  ): AnyAgentTool {
    return defineTool<ReviseSessionContentArgs, UpsertSessionContentResult>({
      name: 'revise_session_content',
      description:
        "Overwrite this ONE existing session's prescription per the athlete's " +
        'requested change. Terminal: ends the run. Rejected if it would breach ' +
        "the week's locked targets — the weekly targets must already be " +
        'revised (by the orchestrator, on athlete confirmation) before this can ' +
        'be called with a larger prescription.',
      schema: reviseSessionContentSchema,
      terminal: true,
      handler: async (args, c) => {
        const draftShape: PlannedSessionDraft = {
          ...args.session,
          slotKey: existing.slotKey,
          dayOffset: 0,
        };
        const violations = validateSessionStructure(draftShape);

        if (targets) {
          const breach = detectWeeklyTargetBreach(
            args.session as LoadProxyInput,
            fixedOthers,
            targets,
          );
          if (breach.breaches) {
            violations.push(
              `This change pushes the week to ${breach.projectedSessionCount} ` +
                `session(s) / ${breach.projectedVolume.toFixed(1)} volume, over ` +
                `the locked budget by ${breach.overBy.sessionCount} session(s) ` +
                `/ ${breach.overBy.volume.toFixed(1)} volume. The weekly ` +
                `targets must be revised first.`,
            );
          }
        }

        if (violations.length > 0) {
          throw new Error(
            `Guardrail rejected session edit: ${violations.join(' ')}`,
          );
        }

        const content: SessionContent = {
          title: args.session.title,
          estDurationMin: args.session.estDurationMin,
          intensityLabel: args.session.intensityLabel,
          coachNotes: args.session.coachNotes,
          running:
            args.session.type === 'running' && args.session.running
              ? (args.session.running as unknown as RunningPlan)
              : null,
          strength:
            args.session.type === 'strength' && args.session.strength
              ? (args.session.strength as unknown as StrengthPlan)
              : null,
        };
        const lastDiff: SessionDiff = {
          committedAt: new Date().toISOString(),
          changes: args.changes,
        };

        return this.commandBus.execute<
          UpsertSessionContentCommand,
          UpsertSessionContentResult
        >(
          new UpsertSessionContentCommand(
            c.userId,
            plannedSessionId,
            content,
            lastDiff,
          ),
        );
      },
    });
  }

  private commitSkeletonTool(programId: string | null): AnyAgentTool {
    return defineTool<CommitSkeletonArgs, CommitSkeletonResult>({
      name: 'commit_program_skeleton',
      description:
        'Persist the full periodization skeleton (weeks[]). Terminal: ends the run.',
      schema: commitSkeletonSchema,
      terminal: true,
      handler: async (args, c) => {
        if (!programId) {
          throw new Error('No active program to commit the skeleton to.');
        }
        const violations = validateSkeleton(args);
        if (violations.length > 0) {
          throw new Error(`Guardrail rejected skeleton: ${violations.join(' ')}`);
        }
        const now = new Date().toISOString();
        const weeks: ProgramWeek[] = args.weeks.map((w) => ({
          weekIndex: w.weekIndex,
          startDate: w.startDate,
          endDate: w.endDate,
          theme: w.theme,
          plannedLoadTarget: w.plannedLoadTarget,
          planState: w.planState,
          status: w.status,
          generatedAt: w.status === 'current' ? now : null,
        }));
        return this.commandBus.execute<
          CommitSkeletonCommand,
          CommitSkeletonResult
        >(
          new CommitSkeletonCommand(
            c.userId,
            programId,
            weeks,
            args.currentWeekIndex,
          ),
        );
      },
    });
  }

  private upsertWeekSessionsTool(
    seed: CoachSeed,
    readiness: ReadinessBand | null,
  ): AnyAgentTool {
    return defineTool<UpsertWeekSessionsArgs, UpsertWeekSessionsResult>({
      name: 'upsert_week_sessions',
      description:
        'Persist this week\'s tentative planned sessions. Terminal: ends the run.',
      schema: upsertWeekSessionsSchema,
      terminal: true,
      handler: async (args, c) => {
        const weeks = seed.skeletonWeeks as ProgramWeek[];
        const thisWeek = weeks.find((w) => w.weekIndex === args.weekIndex);

        // B9 — a locked week is immutable; reject direct mutation outright.
        if (thisWeek?.weekState === 'locked') {
          throw new Error(
            `Week ${args.weekIndex} is locked; its sessions cannot be changed.`,
          );
        }

        const guardCtx = this.buildWeekGuardrailContext(seed, args, readiness);
        const violations = validateWeek(args, guardCtx);

        // B7 — when targets are locked, the per-session drafts must fit inside
        // the macro budget. Validate cumulatively across the proposed sessions.
        const targets = thisWeek?.weeklyTargets;
        if (targets) {
          args.sessions.forEach((session, i) => {
            violations.push(
              ...validateAgainstWeeklyTargets(
                session as LoadProxyInput,
                args.sessions.slice(0, i) as LoadProxyInput[],
                {
                  sessionCount: targets.sessionCount,
                  totalVolume: targets.totalVolume,
                },
              ),
            );
          });
        }

        if (violations.length > 0) {
          throw new Error(`Guardrail rejected week: ${violations.join(' ')}`);
        }
        const sessions = args.sessions.map((s) =>
          this.toDomainSession(c.userId, args, s),
        );
        return this.commandBus.execute<
          UpsertWeekSessionsCommand,
          UpsertWeekSessionsResult
        >(
          new UpsertWeekSessionsCommand(
            c.userId,
            args.programId,
            args.weekIndex,
            sessions,
          ),
        );
      },
    });
  }

  // ── mapping helpers ─────────────────────────────────────────────────────

  /** Prior-week load + theme + readiness, scored in the same proxy units. */
  private buildWeekGuardrailContext(
    seed: CoachSeed,
    args: UpsertWeekSessionsArgs,
    readiness: ReadinessBand | null,
  ): WeekGuardrailContext {
    const weeks = seed.skeletonWeeks as ProgramWeek[];
    const thisWeek = weeks.find((w) => w.weekIndex === args.weekIndex);
    const priorWeekSessions = seed.plannedRecent.filter(
      (p) => p.weekIndex === args.weekIndex - 1,
    );
    const priorWeekLoad =
      priorWeekSessions.length > 0
        ? priorWeekSessions.reduce((sum, p) => sum + sessionLoadProxy(p), 0)
        : null;

    return {
      priorWeekLoad,
      weekTheme: thisWeek?.theme ?? null,
      readiness,
    };
  }

  /** Map a validated draft → a tentative domain PlannedSession. */
  private toDomainSession(
    userId: string,
    args: {
      programId: string;
      weekIndex: number;
      weekStartDate: string;
      timezone: string;
    },
    draft: PlannedSessionDraft,
  ): PlannedSession {
    const scheduledDate = addDaysIso(args.weekStartDate, draft.dayOffset);
    const startTime = '07:00';
    const endTime = addMinutesToTime(startTime, draft.estDurationMin);

    const outcome: PlannedOutcome = {
      status: 'planned',
      reasonCode: null,
      perceivedEffort: null,
      enjoyment: null,
      matchedActivityId: null,
      feedbackRef: null,
      recordedAt: null,
    };

    return {
      id: null,
      userId,
      programId: args.programId,
      weekIndex: args.weekIndex,
      slotKey: draft.slotKey,
      type: draft.type,
      // Provisional placeholders — the Planner owns the real schedule.
      scheduledDate,
      startTime,
      endTime,
      timezone: args.timezone,
      scheduledStartUtc: `${scheduledDate}T${startTime}:00.000Z`,
      planState: 'tentative',
      title: draft.title,
      estDurationMin: draft.estDurationMin,
      intensityLabel: draft.intensityLabel,
      coachNotes: draft.coachNotes,
      running:
        draft.type === 'running' && draft.running
          ? (draft.running as unknown as RunningPlan)
          : null,
      strength:
        draft.type === 'strength' && draft.strength
          ? (draft.strength as unknown as StrengthPlan)
          : null,
      outcome,
      calendarSync: null,
    };
  }
}

/** Add whole days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add minutes to an "HH:mm" wall-clock time, clamped within the same day. */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
