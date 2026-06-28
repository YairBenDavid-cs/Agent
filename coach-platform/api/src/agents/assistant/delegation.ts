import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import {
  AgentToolContext,
  AnyAgentTool,
  defineTool,
} from '../shared/llm/agent-tool';
import {
  AgenticLoopResult,
  AgenticLoopRuntime,
} from '../shared/llm/agentic-loop.runtime';
import { ReadToolRegistry } from '../shared/read-tools/read-tool-registry.service';
import { SeedContextBuilder } from '../shared/seed/seed-context.builder';
import { RecoveryService } from '../recovery/recovery.service';
import { RecoveryVerdict } from '../recovery/recovery.contracts';

/** Coach's advisory answer — an opinion, never a persisted change. */
export const coachAssessmentSchema = z.object({
  summary: z.string().min(1),
  rationale: z.string().min(1),
  recommendation: z.string().nullable().default(null),
});
export type CoachAssessment = z.infer<typeof coachAssessmentSchema>;

const COACH_ADVISORY_PROMPT = `You are the Coach answering an ADVISORY question only. Use the read-tools to
ground your answer in the user's real program, sessions, and performance. You
are giving an OPINION — you must NOT change the plan or call any write tool.
End by calling emit_assessment exactly once with a concise, second-person
summary, your rationale, and a single recommendation (or null).`;

/**
 * Advisory delegation: lets the assistant ask the Coach or Recovery Guru for an
 * OPINION without ceding write authority. A specialist invoked here runs in
 * read-only mode — same seeded context + read-tools, but its terminal WRITE
 * tools are withheld; it returns a structured verdict/assessment object only.
 * "Do it" later is a separate, explicit change that fires the real pipeline WITH
 * write authority. Delegation = ask an opinion; pipeline = make the change.
 */
@Injectable()
export class DelegationService {
  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly seeds: SeedContextBuilder,
    private readonly readTools: ReadToolRegistry,
    private readonly recovery: RecoveryService,
  ) {}

  /** Recovery is ALREADY advisory (emit_verdict persists nothing) — reuse it. */
  recoveryOpinion(
    userId: string,
    runId: string,
    weekWindow: { from: string; to: string },
  ): Promise<AgenticLoopResult<RecoveryVerdict>> {
    return this.recovery.assessReadiness(userId, runId, { weekWindow });
  }

  /** Coach advisory loop: read-tools only, non-persisting structured output. */
  async coachOpinion(
    userId: string,
    runId: string,
    discipline: EventDiscipline,
    question: string,
  ): Promise<AgenticLoopResult<CoachAssessment>> {
    const seed = await this.seeds.buildCoachSeed(userId, discipline);
    const tools: AnyAgentTool[] = [
      ...this.readTools.forCoach(),
      this.emitAssessmentTool(),
    ];
    return this.loop.run<CoachAssessment>({
      agentName: 'coach-advisory',
      systemPrompt: COACH_ADVISORY_PROMPT,
      seedMessage: `${seed.seedMessage}\n\n== ADVISORY QUESTION ==\n${question}\nAnswer with emit_assessment. Do NOT change the plan.`,
      tools,
      ctx: { userId, runId },
      temperature: 0.3,
    });
  }

  /**
   * The two delegation tools the assistant can call mid-loop. They are
   * non-terminal: the verdict/assessment is fed back so the assistant can
   * incorporate it into its own reply.
   */
  delegationTools(opts: {
    discipline: EventDiscipline;
    weekWindow: { from: string; to: string };
  }): AnyAgentTool[] {
    return [
      this.askRecoveryTool(opts.weekWindow),
      this.askCoachTool(opts.discipline),
    ];
  }

  private askRecoveryTool(weekWindow: {
    from: string;
    to: string;
  }): AnyAgentTool {
    return defineTool<Record<string, never>, RecoveryVerdict | null>({
      name: 'ask_recovery',
      description:
        'Ask the Recovery Guru for a readiness verdict (advisory; changes nothing). Use for "am I recovered enough?" style questions.',
      schema: z.object({}),
      terminal: false,
      handler: async (_args, ctx: AgentToolContext) => {
        const res = await this.recoveryOpinion(
          ctx.userId,
          ctx.runId,
          weekWindow,
        );
        return res.terminalResult;
      },
    });
  }

  private askCoachTool(discipline: EventDiscipline): AnyAgentTool {
    return defineTool<{ question: string }, CoachAssessment | null>({
      name: 'ask_coach',
      description:
        'Ask the Coach for an opinion (advisory; changes nothing). Use for "should I swap X?" / "am I on track for my goal?" style questions.',
      schema: z.object({ question: z.string().min(1) }),
      terminal: false,
      handler: async (args, ctx: AgentToolContext) => {
        const res = await this.coachOpinion(
          ctx.userId,
          ctx.runId,
          discipline,
          args.question,
        );
        return res.terminalResult;
      },
    });
  }

  private emitAssessmentTool(): AnyAgentTool {
    return defineTool<CoachAssessment, CoachAssessment>({
      name: 'emit_assessment',
      description:
        'Emit the final advisory assessment. Terminal: ends the run. Performs no write.',
      schema: coachAssessmentSchema,
      terminal: true,
      handler: (args) => Promise.resolve(args),
    });
  }
}
