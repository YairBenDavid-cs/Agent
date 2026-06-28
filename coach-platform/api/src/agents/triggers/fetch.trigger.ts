import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../users/domain/users.repository.port';
import { Pipeline, PipelineRunResult } from '../orchestrator/pipeline.types';
import { PipelineQueue } from '../shared/queue/pipeline-queue.service';
import { TriggerContextResolver } from './trigger-context.resolver';

/**
 * The scheduled `fetch` (session-day) trigger — the heaviest pipeline and the
 * only one that always runs the Recovery gate. This is the place the plan calls
 * out for graduating the lightweight Cron to the durable BullMQ queue: it
 * resolves each user's run context and ENQUEUES a FULL_SESSION_DAY job (one per
 * user per day, idempotent on the runId), rather than running inline. Per-user
 * single-flight + idempotency are the queue's job; per-tenant failures stay
 * isolated so one user never blocks the fan-out.
 */
@Injectable()
export class FetchTrigger {
  private readonly logger = new Logger(FetchTrigger.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly users: UsersRepositoryPort,
    private readonly resolver: TriggerContextResolver,
    private readonly queue: PipelineQueue,
  ) {}

  /** Enqueue today's session-day pipeline for one user. */
  async runForUser(
    userId: string,
    today: string,
  ): Promise<PipelineRunResult | null> {
    const ctx = await this.resolver.resolve(userId);
    if (!ctx) {
      return null; // no active program / current week — nothing to fetch.
    }
    return this.queue.enqueue({
      pipeline: Pipeline.FULL_SESSION_DAY,
      ctx: {
        userId,
        // One run per user per day; retries within the day dedupe.
        runId: `fetch:${userId}:${today}`,
        discipline: ctx.discipline,
        timezone: ctx.timezone,
        weekWindow: ctx.weekWindow,
        weekIndex: ctx.weekIndex,
        programId: ctx.programId,
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async runDaily(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const userIds = await this.users.findActiveIds();
    this.logger.log(`Session-day fetch fan-out for ${userIds.length} users.`);

    for (const userId of userIds) {
      try {
        await this.runForUser(userId, today);
      } catch (err) {
        // Isolate per-tenant failures; the next user still enqueues.
        this.logger.error(`Fetch enqueue failed for ${userId}: ${String(err)}`);
      }
    }
  }
}
