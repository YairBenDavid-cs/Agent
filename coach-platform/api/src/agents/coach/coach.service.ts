import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  CommitSkeletonCommand,
  CommitSkeletonResult,
} from '../../program/application/commands/commit-skeleton.command';
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
  PlannedSessionDraft,
  UpsertWeekSessionsArgs,
  upsertWeekSessionsSchema,
} from './coach.contracts';
import {
  ReadinessBand,
  sessionLoadProxy,
  validateSkeleton,
  validateWeek,
  WeekGuardrailContext,
} from './coach.guardrails';
import { COACH_SYSTEM_PROMPT } from './coach.prompt';

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

  // ── terminal write tools ──────────────────────────────────────────────────

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
        const guardCtx = this.buildWeekGuardrailContext(seed, args, readiness);
        const violations = validateWeek(args, guardCtx);
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
    args: UpsertWeekSessionsArgs,
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
