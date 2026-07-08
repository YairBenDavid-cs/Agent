import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PendingCardBatchService } from '../../approval/pending-card-batch.service';
import { OrchestratorSaga } from '../../orchestrator/orchestrator.saga';
import {
  Pipeline,
  PipelineRunContext,
  PipelineRunResult,
} from '../../orchestrator/pipeline.types';
import {
  GARMIN_SYNC_BATCH_RECORDED,
  GARMIN_SYNC_RUN_ID_PREFIX,
  GarminSyncBatchRecordedEvent,
} from './events/garmin-sync-batch-recorded.event';
import { IdempotencyStore } from './idempotency.store';

/** One unit of work: the selected pipeline + everything it needs to run. */
export interface PipelineJob {
  pipeline: Pipeline;
  ctx: PipelineRunContext;
}

/** Claimed runs are remembered for 24h so retries within a day dedupe. */
const RUN_CLAIM_TTL_SECONDS = 24 * 60 * 60;
/** A per-user run should never legitimately hold the mutex longer than this. */
const USER_LOCK_TTL_SECONDS = 10 * 60;

/**
 * Per-user single-flight entry point for every pipeline run. Three guarantees,
 * each defended independently so the weakest backend still stays correct:
 *
 *  1. **Idempotency** — `runId` is claimed once (Redis SET-NX, in-memory
 *     fallback). A replay/retry of the same run returns null without re-running.
 *  2. **Serialization (concurrency = 1 / userId)** — an in-process per-user
 *     promise chain orders a user's runs; a Redis mutex extends that ordering
 *     across processes when Redis is reachable. A scheduled `fetch` and a
 *     simultaneous mid-chat change for the same user can never race.
 *  3. **Supersession** — if a newer run for the same user+week is enqueued
 *     before an earlier one finishes, the earlier result is flagged
 *     `superseded` so its pending approval card is invalidated (Phase 9).
 *
 * Safe by construction: every pipeline reads fresh state at start and writes
 * tentative-only until approval, so the later run simply overwrites the earlier.
 * Eager `preference_event` writes happen OUTSIDE this lock (append-only, in the
 * assistant), so intent is never lost even while a run is queued.
 */
@Injectable()
export class PipelineQueue {
  private readonly logger = new Logger(PipelineQueue.name);

  /** userId -> tail of that user's serialized run chain. */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** `${userId}:${weekFrom}` -> the most recently enqueued runId. */
  private readonly latestRun = new Map<string, string>();

  constructor(
    private readonly saga: OrchestratorSaga,
    private readonly idempotency: IdempotencyStore,
    private readonly batches: PendingCardBatchService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Enqueue a run. Resolves with the run result, or null if the runId was a
   * duplicate (already claimed) and was therefore skipped.
   */
  async enqueue(job: PipelineJob): Promise<PipelineRunResult | null> {
    const { runId, userId } = job.ctx;

    const fresh = await this.idempotency.claim(runId, RUN_CLAIM_TTL_SECONDS);
    if (!fresh) {
      this.logger.log(`Run ${runId} already claimed — skipping duplicate.`);
      return null;
    }

    const supKey = this.supersessionKey(job.ctx);
    this.latestRun.set(supKey, runId);

    return this.serialize(userId, () => this.runJob(job, supKey));
  }

  /** Whether `runId` is still the latest enqueued run for its user+week. */
  isLatest(ctx: PipelineRunContext): boolean {
    return this.latestRun.get(this.supersessionKey(ctx)) === ctx.runId;
  }

  private supersessionKey(ctx: PipelineRunContext): string {
    return `${ctx.userId}:${ctx.weekWindow.from}`;
  }

  /** Chain `fn` after any in-flight run for this user (single-flight). */
  private serialize<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(userId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    // Keep the chain tidy: drop the entry once this is the last link.
    const tracked = next.finally(() => {
      if (this.chains.get(userId) === tracked) {
        this.chains.delete(userId);
      }
    });
    this.chains.set(userId, tracked);
    return next;
  }

  private async runJob(
    job: PipelineJob,
    supKey: string,
  ): Promise<PipelineRunResult> {
    const lockKey = `user:${job.ctx.userId}`;
    const locked = await this.idempotency.acquireLock(
      lockKey,
      USER_LOCK_TTL_SECONDS,
    );

    try {
      const result = await this.saga.run(job.pipeline, job.ctx);
      // A newer run claimed the same week while we ran → our card is stale.
      if (this.latestRun.get(supKey) !== job.ctx.runId) {
        result.superseded = true;
      }
      await this.maybeRecordBatch(job, result);
      return result;
    } finally {
      if (locked) {
        await this.idempotency.releaseLock(lockKey);
      }
    }
  }

  /**
   * Persist a pending approval card batch for a run that successfully produced a
   * tentative week. Skipped for WRITE_ONLY (no week), aborted runs (nothing to
   * approve), superseded runs (a newer batch already exists), and runs without
   * the program/week identity needed to key the batch.
   */
  private async maybeRecordBatch(
    job: PipelineJob,
    result: PipelineRunResult,
  ): Promise<void> {
    if (
      result.status !== 'completed' ||
      result.superseded ||
      job.pipeline === Pipeline.WRITE_ONLY ||
      !job.ctx.programId ||
      job.ctx.weekIndex === undefined
    ) {
      return;
    }
    try {
      const batch = await this.batches.record({
        userId: job.ctx.userId,
        programId: job.ctx.programId,
        weekIndex: job.ctx.weekIndex,
        kind:
          job.pipeline === Pipeline.FULL_SESSION_DAY
            ? 'session_day'
            : 'user_initiated',
        runId: job.ctx.runId,
        conversationId: job.ctx.conversationId ?? null,
        reason: composeBatchReason(job.ctx, result),
      });
      if (job.ctx.runId.startsWith(`${GARMIN_SYNC_RUN_ID_PREFIX}:`)) {
        this.events.emit(
          GARMIN_SYNC_BATCH_RECORDED,
          new GarminSyncBatchRecordedEvent({
            userId: job.ctx.userId,
            programId: job.ctx.programId,
            weekIndex: job.ctx.weekIndex,
            batchId: batch.id,
            runId: job.ctx.runId,
          }),
        );
      }
    } catch (err) {
      // A bookkeeping failure must never fail the run — the tentative week is
      // already persisted and can still be approved by (program, week).
      this.logger.warn(
        `Run ${job.ctx.runId} completed but recording its card batch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/**
 * The persisted "why" for the batch: the trigger's own reason (e.g. the Garmin
 * significance gate's findings) plus the Recovery verdict's rationale when the
 * run flagged reduced readiness. Null when neither exists — an unexplained
 * batch renders without a reason line, never with a guessed one.
 */
function composeBatchReason(
  ctx: PipelineRunContext,
  result: PipelineRunResult,
): string | null {
  const parts: string[] = [];
  if (ctx.syncReason) {
    parts.push(ctx.syncReason);
  }
  const verdict = result.recoveryVerdict;
  if (verdict && verdict.readiness !== 'green') {
    parts.push(
      `Recovery readiness is ${verdict.readiness}: ${verdict.rationale}`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
