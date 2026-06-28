import { Injectable } from '@nestjs/common';
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
import { RecoveryVerdict, recoveryVerdictSchema } from './recovery.contracts';
import { RECOVERY_SYSTEM_PROMPT } from './recovery.prompt';

export interface AssessReadinessOptions {
  /** The target week to seed the plan-under-review from. */
  weekWindow: { from: string; to: string };
}

/**
 * The Recovery Guru agent. Runs ONE bounded advisory loop, pre-seeded with the
 * 9-block recovery context, and returns a Zod-validated readiness verdict. It
 * holds only read tools plus a single NON-persisting terminal tool
 * (`emit_verdict`) — the structured-output exit. It never writes the plan;
 * acting on the verdict is the orchestrator/Coach's job (single writer per
 * resource).
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly seeds: SeedContextBuilder,
    private readonly readTools: ReadToolRegistry,
  ) {}

  async assessReadiness(
    userId: string,
    runId: string,
    opts: AssessReadinessOptions,
  ): Promise<AgenticLoopResult<RecoveryVerdict>> {
    const seed = await this.seeds.buildRecoverySeed(userId, opts.weekWindow);
    const ctx: AgentToolContext = { userId, runId };

    const tools: AnyAgentTool[] = [
      ...this.readTools.forRecovery(),
      this.emitVerdictTool(),
    ];

    return this.loop.run<RecoveryVerdict>({
      agentName: 'recovery',
      systemPrompt: RECOVERY_SYSTEM_PROMPT,
      seedMessage: `${seed.seedMessage}\n\n== TASK ==\nAssess readiness for the plan under review and call emit_verdict exactly once.`,
      tools,
      ctx,
      // Lower temperature: a gate should be consistent, not creative.
      temperature: 0.2,
    });
  }

  /**
   * The structured-output exit. Terminal so the first call ends the loop, but
   * it performs NO write — it simply returns the validated verdict object.
   */
  private emitVerdictTool(): AnyAgentTool {
    return defineTool<RecoveryVerdict, RecoveryVerdict>({
      name: 'emit_verdict',
      description:
        'Emit the final readiness verdict. Terminal: ends the run. Performs no write.',
      schema: recoveryVerdictSchema,
      terminal: true,
      handler: (args) => Promise.resolve(args),
    });
  }
}
