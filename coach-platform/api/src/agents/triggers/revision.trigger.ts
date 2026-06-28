import { Injectable, Logger } from '@nestjs/common';
import { Pipeline, PipelineRunResult } from '../orchestrator/pipeline.types';
import { PipelineQueue } from '../shared/queue/pipeline-queue.service';
import { TriggerContextResolver } from './trigger-context.resolver';

/**
 * The `revision` trigger. Structured weekly-revision cards are captured
 * deterministically (the existing SubmitWeeklyRevisionsCommand writes the tagged
 * events under one `batchId`). AFTER that capture, this fires a whole-week
 * re-plan: CONTENT_REPLAN (Coach re-plans the week treating each card as a hard
 * constraint, minimal-diff, then Planner re-places). The `batchId` is the
 * idempotency key, so re-submitting the same batch replaces rather than
 * duplicates.
 */
@Injectable()
export class RevisionTrigger {
  private readonly logger = new Logger(RevisionTrigger.name);

  constructor(
    private readonly resolver: TriggerContextResolver,
    private readonly queue: PipelineQueue,
  ) {}

  async run(
    userId: string,
    batchId: string,
  ): Promise<PipelineRunResult | null> {
    const ctx = await this.resolver.resolve(userId);
    if (!ctx) {
      return null;
    }
    this.logger.log(`Revision batch ${batchId} → CONTENT_REPLAN for ${userId}.`);
    return this.queue.enqueue({
      pipeline: Pipeline.CONTENT_REPLAN,
      ctx: {
        userId,
        runId: `revision:${batchId}`,
        discipline: ctx.discipline,
        timezone: ctx.timezone,
        weekWindow: ctx.weekWindow,
        weekIndex: ctx.weekIndex,
      },
    });
  }
}
