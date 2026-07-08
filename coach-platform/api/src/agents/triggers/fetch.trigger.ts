import { Injectable, Logger } from '@nestjs/common';
import { Pipeline, PipelineRunResult } from '../orchestrator/pipeline.types';
import { PipelineQueue } from '../shared/queue/pipeline-queue.service';
import { TriggerContextResolver } from './trigger-context.resolver';

/**
 * The `fetch` (session-day) trigger — the heaviest pipeline and the only one
 * that always runs the Recovery gate. Resolves a user's run context and
 * ENQUEUES a FULL_SESSION_DAY job, rather than running inline. Per-user
 * single-flight + idempotency are the queue's job; callers isolate their own
 * per-tenant failures.
 *
 * Firing is owned by callers, not this class: the configurable per-user
 * Garmin sync sweep (`agents/triggers/garmin-sync.scheduler.ts`) calls
 * `runForUser` once per configured sync time, tagging the run with its own
 * `runId` prefix so the resulting pending-card batch can be attributed back to
 * the sync that produced it.
 */
@Injectable()
export class FetchTrigger {
  private readonly logger = new Logger(FetchTrigger.name);

  constructor(
    private readonly resolver: TriggerContextResolver,
    private readonly queue: PipelineQueue,
  ) {}

  /**
   * Enqueue the session-day pipeline for one user. `runId` defaults to one run
   * per user per day (`fetch:${userId}:${today}`); callers that need to
   * attribute the run to a specific trigger (e.g. a scheduled sync) may
   * override it.
   */
  async runForUser(
    userId: string,
    today: string,
    runId: string = `fetch:${userId}:${today}`,
    syncReason: string | null = null,
  ): Promise<PipelineRunResult | null> {
    // Date-matched, NOT the build pointer: after a scheduled build advances
    // `currentWeekIndex` onto next week early, the session-day pipeline must
    // still run against the week the athlete is actually living in.
    const ctx = await this.resolver.resolveForToday(userId);
    if (!ctx) {
      return null; // no active program / current week — nothing to fetch.
    }
    return this.queue.enqueue({
      pipeline: Pipeline.FULL_SESSION_DAY,
      ctx: {
        userId,
        runId,
        discipline: ctx.discipline,
        timezone: ctx.timezone,
        weekWindow: ctx.weekWindow,
        weekIndex: ctx.weekIndex,
        programId: ctx.programId,
        syncReason,
      },
    });
  }
}
