import { Body, Controller, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { ApiError } from '../../../common/errors/api-error';
import { Pipeline, PipelineRunResult } from '../../orchestrator/pipeline.types';
import { PipelineQueue } from '../../shared/queue/pipeline-queue.service';
import { TriggerContextResolver } from '../trigger-context.resolver';
import { ReplanDto, ReplanScope } from './dto/replan.dto';

/** Maps a user-facing re-plan scope onto the minimal-sufficient pipeline. */
const SCOPE_TO_PIPELINE: Record<ReplanScope, Pipeline> = {
  safety: Pipeline.SAFETY_REPLAN,
  content: Pipeline.CONTENT_REPLAN,
  timing: Pipeline.TIMING_REPLACE,
};

/**
 * Manual pipeline triggers — the deterministic entry points a user (or the UI)
 * can fire directly, without going through a chat turn. Two operations:
 *
 *  - `POST /agents/program/generate` → pipeline 5 (re-lay the skeleton + week 1).
 *  - `POST /agents/replan { scope }`  → pipelines 2/3/4 (safety / content / timing).
 *
 * Both resolve the run context deterministically from the active program (so an
 * empty-program user is rejected up front) and hand the job to the per-user
 * single-flight queue, which serializes against any in-flight scheduled run.
 * Identity always comes from the JWT; the body only carries the scope.
 */
@Controller('agents')
export class AgentsTriggerController {
  constructor(
    private readonly queue: PipelineQueue,
    private readonly triggerContext: TriggerContextResolver,
  ) {}

  /** POST /agents/program/generate — regenerate the program skeleton + week 1. */
  @Post('program/generate')
  async generateProgram(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PipelineRunResult | null> {
    const ctx = await this.triggerContext.resolve(user.userId);
    if (!ctx) {
      throw ApiError.badRequest(
        'No active program to regenerate — complete onboarding first.',
      );
    }
    return this.queue.enqueue({
      pipeline: Pipeline.PROGRAM_GENERATION,
      ctx: {
        userId: user.userId,
        runId: `program-gen:${user.userId}:${randomUUID()}`,
        discipline: ctx.discipline,
        timezone: ctx.timezone,
        weekWindow: ctx.weekWindow,
        weekIndex: ctx.weekIndex,
        programId: ctx.programId,
      },
    });
  }

  /** POST /agents/replan — fire a safety / content / timing re-plan of the week. */
  @Post('replan')
  async replan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplanDto,
  ): Promise<PipelineRunResult | null> {
    const ctx = await this.triggerContext.resolve(user.userId);
    if (!ctx) {
      throw ApiError.badRequest(
        'No active program — generate a program before requesting a re-plan.',
      );
    }
    return this.queue.enqueue({
      pipeline: SCOPE_TO_PIPELINE[dto.scope],
      ctx: {
        userId: user.userId,
        runId: `replan-${dto.scope}:${user.userId}:${randomUUID()}`,
        discipline: ctx.discipline,
        timezone: ctx.timezone,
        weekWindow: ctx.weekWindow,
        weekIndex: ctx.weekIndex,
        programId: ctx.programId,
      },
    });
  }
}
