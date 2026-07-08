import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutoModeLockService } from './auto-mode-lock.service';

/** Max stale runs a single sweep tick reaps (keeps the tick cheap). */
const REAP_LIMIT = 50;

/**
 * Scheduled sweep that reaps `running` auto-mode runs past the lock TTL — a
 * crashed graph process would otherwise leave `ProgramWeek.runLockId` held
 * forever, blocking every future auto-mode run and manual edit on that week.
 * Runs every 5 minutes: fine-grained enough that a crash under the 15-minute
 * TTL clears within one extra tick. Mirrors `ApprovalTtlService`.
 */
@Injectable()
export class AutoModeReaperService {
  private readonly logger = new Logger(AutoModeReaperService.name);

  constructor(private readonly locks: AutoModeLockService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    try {
      const reaped = await this.locks.reapStale(REAP_LIMIT);
      if (reaped > 0) {
        this.logger.log(`Reaped ${reaped} stale auto-mode run(s).`);
      }
    } catch (err) {
      this.logger.error(
        `Auto-mode reap sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
