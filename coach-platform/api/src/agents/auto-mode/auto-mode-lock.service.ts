import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PROGRAM_REPOSITORY,
  ProgramRepositoryPort,
} from '../../program/domain/program.repository.port';
import {
  AUTO_MODE_RUN_REPOSITORY,
  AutoModeRunRepositoryPort,
} from './domain/auto-mode-run.repository.port';

/** A `running` run past this age is presumed dead — its process crashed mid-graph. */
export const AUTO_MODE_LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Mutual-exclusion boundary between AutoModeGraph runs and everything else
 * that can touch a week (manual edits, a `program_build` conversation, another
 * autonomous run). Acquiring is holding `ProgramWeek.runLockId`; nothing else
 * about the run is durable through this service — the run's own audit trail
 * lives in `AutoModeRunRepositoryPort`.
 */
@Injectable()
export class AutoModeLockService {
  private readonly logger = new Logger(AutoModeLockService.name);

  constructor(
    @Inject(PROGRAM_REPOSITORY) private readonly programs: ProgramRepositoryPort,
    @Inject(AUTO_MODE_RUN_REPOSITORY)
    private readonly runs: AutoModeRunRepositoryPort,
  ) {}

  /** True if the lock was acquired (or already held by this same runId). */
  async acquire(
    userId: string,
    programId: string,
    weekIndex: number,
    runId: string,
  ): Promise<boolean> {
    return this.programs.setWeekRunLock(userId, programId, weekIndex, {
      runId,
      lockedAt: new Date().toISOString(),
    });
  }

  /** Re-stamp `lockedAt` so the TTL reaper doesn't treat a slow-but-live run as stale. */
  async heartbeat(
    userId: string,
    programId: string,
    weekIndex: number,
    runId: string,
  ): Promise<void> {
    await this.programs.setWeekRunLock(
      userId,
      programId,
      weekIndex,
      { runId, lockedAt: new Date().toISOString() },
      runId,
    );
  }

  /** Releases only if `runId` is still the holder — never clobbers a newer lock. */
  async release(
    userId: string,
    programId: string,
    weekIndex: number,
    runId: string,
  ): Promise<void> {
    await this.programs.setWeekRunLock(userId, programId, weekIndex, null, runId);
  }

  /**
   * Sweeps `running` runs older than the TTL: fails the run record and drops
   * its week lock, so a crashed process never leaves a week permanently
   * unwritable. Called by the M6 cron reaper.
   */
  async reapStale(limit = 50): Promise<number> {
    const stale = await this.runs.findStaleRunning(AUTO_MODE_LOCK_TTL_MS, limit);
    for (const run of stale) {
      this.logger.warn(
        `Reaping stale auto-mode run ${run.id} (user ${run.userId}, week ${run.weekIndex}) — past ${AUTO_MODE_LOCK_TTL_MS}ms TTL.`,
      );
      await this.release(run.userId, run.programId, run.weekIndex, run.id);
      await this.runs.markFailed(run.id, 'Reaped: run exceeded the lock TTL without completing.');
    }
    return stale.length;
  }
}
