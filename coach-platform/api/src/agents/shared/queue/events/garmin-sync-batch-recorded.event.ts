export const GARMIN_SYNC_BATCH_RECORDED = 'agents.garmin-sync.batch-recorded';

/**
 * Every `runId` the Garmin sync sweep enqueues is tagged with this prefix, so
 * `PipelineQueue.maybeRecordBatch` can recognize a sync-originated run without
 * depending on the scheduler that produced it (this constant is the shared
 * seam both sides import).
 */
export const GARMIN_SYNC_RUN_ID_PREFIX = 'garmin-sync';

/**
 * Emitted after `PipelineQueue` records a pending card batch for a run whose
 * `runId` was tagged by the Garmin sync sweep (`garmin-sync:` prefix). The
 * queue only tags and emits — deciding what to DO about it (Plan vs Auto mode)
 * lives in `agents/triggers/garmin-sync-batch.listener.ts`, kept separate so
 * the queue never depends on conversation/approval machinery.
 */
export class GarminSyncBatchRecordedEvent {
  constructor(
    public readonly payload: {
      userId: string;
      programId: string;
      weekIndex: number;
      batchId: string;
      runId: string;
    },
  ) {}
}
