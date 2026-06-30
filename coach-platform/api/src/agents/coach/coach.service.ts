import { Injectable } from '@nestjs/common';
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
import { ProgramWeek } from '../../program/domain/program.model';
import {
  UpsertWeekSessionsCommand,
  UpsertWeekSessionsResult,
} from '../../planned-sessions/application/commands/upsert-week-sessions.command';
import {
  PlannedOutcome,
  PlannedSession,
  RunningPlan,
  StrengthPlan,
} from '../../planned-sessions/domain/planned-session.model';
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
  UpsertWeekSessionsArgs,
  upsertWeekSessionsSchema,
} from './coach.contracts';
import {
  LoadProxyInput,
  ReadinessBand,
  sessionLoadProxy,
  validateAgainstWeeklyTargets,
  validateSessionStructure,
  validateSkeleton,
  validateWeek,
  WeekGuardrailContext,
} from './coach.guardrails';
import { COACH_SYSTEM_PROMPT } from './coach.prompt';

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
    opts: { weekIndex?: number },
  ): Promise<AgenticLoopResult<ProposeWeeklyTargetsResult>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const ctx: AgentToolContext = { userId, runId };
    const targetWeek = opts.weekIndex ?? seed.currentWeekIndex ?? 0;

    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.proposeWeeklyTargetsTool(seed.programId),
    ];

    return this.loop.run<ProposeWeeklyTargetsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage:
        `${seed.seedMessage}\n\n== TASK (Conversational build — propose week targets) ==\n` +
        `Decide the macro budget for week index ${targetWeek}: how many sessions, ` +
        `the total native-unit volume (km for running, volume-load for strength), ` +
        `and the key weekly goals. First call propose_weekly_targets exactly once ` +
        `with programId "${seed.programId ?? ''}". Then, in plain language, write a ` +
        `short, warm message (2–4 sentences) to the athlete proposing this first ` +
        `week — name the session count and the main intents — and ask whether it ` +
        `looks good or they'd like to adjust. Do NOT lock anything yet.`,
      tools,
      ctx,
    });
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
   * Resolve the user's response to a tentative targets proposal. The coach reads
   * the proposed quota + the athlete's reply and EITHER locks the targets (they
   * agreed — possibly with a small tweak, applied first) via the terminal
   * `lock_weekly_targets` tool, OR re-proposes a revised quota via the
   * non-terminal `propose_weekly_targets` tool and explains the change
   * (`finalText`). Both tools are available; the model picks based on intent.
   */
  async resolveTargetsConsent(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    opts: {
      weekIndex: number;
      proposed: { sessionCount: number; totalVolume: number; keyGoals: string[] };
      userMessage: string;
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

    return this.loop.run<LockWeeklyTargetsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage:
        `${seed.seedMessage}\n\n== TASK (Conversational build — targets consent) ==\n` +
        `You previously PROPOSED these week-${opts.weekIndex} targets:\n` +
        `  • sessions: ${sessionCount}\n  • total volume: ${totalVolume}\n` +
        `  • key goals: ${keyGoals.join(', ') || '(none)'}\n\n` +
        `The athlete replied:\n"""${opts.userMessage}"""\n\n` +
        `Decide their intent:\n` +
        `- If they AGREE / approve / say it looks good → call lock_weekly_targets ` +
        `with programId "${seed.programId ?? ''}", weekIndex ${opts.weekIndex}, and ` +
        `the agreed numbers (apply any small tweak they asked for). This finalizes ` +
        `the week's quota.\n` +
        `- If they want CHANGES you should reconsider → call propose_weekly_targets ` +
        `with the revised numbers, then write a short message explaining the update ` +
        `and asking if it now looks good. Do NOT lock in that case.`,
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

    return this.loop.run<UpsertWeekSessionsResult>({
      agentName: 'coach',
      systemPrompt: COACH_SYSTEM_PROMPT,
      seedMessage:
        `${seed.seedMessage}\n\n== TASK (Conversational build — draft session ` +
        `${sessionNumber} of ${opts.targets.sessionCount}) ==\n` +
        `Week index ${opts.weekIndex} (starts ${opts.weekStartDate}, timezone ` +
        `${opts.timezone}). The week's LOCKED targets are:\n` +
        `  • sessions: ${opts.targets.sessionCount}\n` +
        `  • total volume: ${opts.targets.totalVolume}\n` +
        `  • key goals: ${goals}\n` +
        `Already committed slotKeys: ${committedList}.\n\n` +
        `Draft EXACTLY ONE new session — the next one — that fits the remaining ` +
        `quota. Call draft_next_session exactly once with programId ` +
        `"${programId ?? ''}" and a unique slotKey. Then write a short, warm ` +
        `message (2–3 sentences) describing this session to the athlete and ask ` +
        `if it looks good to add. Do not draft more than one session.`,
      tools,
      ctx,
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
