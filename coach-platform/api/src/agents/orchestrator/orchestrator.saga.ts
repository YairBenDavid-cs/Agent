import { Injectable, Logger } from '@nestjs/common';
import { AgenticLoopResult } from '../shared/llm/agentic-loop.runtime';
import { CoachService } from '../coach/coach.service';
import { PlacementReport } from '../planner/planner.contracts';
import { PlannerService } from '../planner/planner.service';
import { RecoveryService } from '../recovery/recovery.service';
import { RecoveryVerdict } from '../recovery/recovery.contracts';
import {
  Pipeline,
  PipelineRunContext,
  PipelineRunResult,
} from './pipeline.types';

/**
 * The deterministic orchestrator. A plain state machine — NOT an LLM manager —
 * that runs the minimal sufficient pipeline by sequencing the specialist agents.
 * The LLM intelligence lives INSIDE each agent; this layer owns choreography,
 * fail-safe semantics, and replayability.
 *
 * Fail-safe: every agent stage writes TENTATIVE-only; if a stage fails (no
 * terminal result / loop exhausted) the run ABORTS and surfaces the reason —
 * nothing user-visible is committed (commit + Google sync happen later, at
 * approval). Pipelines 2–4 are subsets of pipeline 1.
 */
@Injectable()
export class OrchestratorSaga {
  private readonly logger = new Logger(OrchestratorSaga.name);

  constructor(
    private readonly coach: CoachService,
    private readonly recovery: RecoveryService,
    private readonly planner: PlannerService,
  ) {}

  async run(
    pipeline: Pipeline,
    ctx: PipelineRunContext,
  ): Promise<PipelineRunResult> {
    const result: PipelineRunResult = {
      pipeline,
      status: 'completed',
      stages: [],
      recoveryVerdict: null,
      placement: null,
    };

    try {
      switch (pipeline) {
        case Pipeline.WRITE_ONLY:
          // No agents — the caller already appended the event + rebuilt the
          // projection. Nothing for the saga to do.
          return result;

        case Pipeline.PROGRAM_GENERATION:
          await this.runProgramGeneration(ctx, result);
          break;

        case Pipeline.FULL_SESSION_DAY:
        case Pipeline.SAFETY_REPLAN:
          await this.runGatedReplan(ctx, result);
          break;

        case Pipeline.CONTENT_REPLAN:
          await this.runContentReplan(ctx, result);
          break;

        case Pipeline.TIMING_REPLACE:
          await this.runTimingReplace(ctx, result);
          break;
      }
    } catch (err) {
      result.status = 'aborted';
      result.abortReason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Pipeline ${pipeline} aborted for run ${ctx.runId}: ${result.abortReason}`,
      );
    }

    return result;
  }

  // ── pipeline bodies ──────────────────────────────────────────────────────

  /** 5: skeleton -> week 1 -> place. */
  private async runProgramGeneration(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('coach.generateProgram');
    this.requireTerminal(
      await this.coach.generateProgram(ctx.userId, ctx.runId, ctx.discipline),
      'coach.generateProgram',
    );

    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  /** 1 + 2: Recovery gate -> Coach revise whole week -> place. */
  private async runGatedReplan(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('recovery.assessReadiness');
    const verdict = this.requireTerminal(
      await this.recovery.assessReadiness(ctx.userId, ctx.runId, {
        weekWindow: ctx.weekWindow,
      }),
      'recovery.assessReadiness',
    );
    result.recoveryVerdict = verdict;

    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
        readiness: verdict.readiness,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  /** 3: Coach re-plans the week -> place. */
  private async runContentReplan(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  /** 4: Planner re-place only. */
  private async runTimingReplace(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    await this.place(ctx, result);
  }

  // ── shared stage ─────────────────────────────────────────────────────────

  private async place(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('planner.placeWeek');
    const placement = this.requireTerminal(
      await this.planner.placeWeek(ctx.userId, ctx.runId, {
        weekWindow: ctx.weekWindow,
        timezone: ctx.timezone,
      }),
      'planner.placeWeek',
    );
    result.placement = placement;

    if (placement.unplaceable.length > 0) {
      // A genuine conflict the Planner could not auto-resolve. The Coach
      // sacrifice + user HITL loop is the approval/card flow's job (later
      // phase); here we surface it on the result rather than dropping sessions.
      this.logger.log(
        `Run ${ctx.runId}: ${placement.unplaceable.length} unplaceable session(s) — surfacing for conflict resolution.`,
      );
    }
  }

  /** Unwrap an agent loop result or fail the run (fail-safe: nothing commits). */
  private requireTerminal<T>(
    loop: AgenticLoopResult<T>,
    stage: string,
  ): T {
    if (loop.exhausted || loop.terminalResult === null) {
      throw new Error(
        `${stage} produced no terminal result (exhausted=${loop.exhausted}, iterations=${loop.iterations}).`,
      );
    }
    return loop.terminalResult;
  }
}
