import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  USERS_REPOSITORY,
  UsersRepositoryPort,
} from '../../users/domain/users.repository.port';
import { IngestionOrchestrator } from '../application/ingestion.orchestrator';

/**
 * Thin time trigger. It only enumerates tenants and fans out to the orchestrator;
 * all real work lives there. A failure for one tenant is logged and isolated so
 * it never blocks the others.
 *
 * This is deliberately the lightest possible scheduler. When runs need
 * durability, retries across restarts, or fan-out to the coach Agent, this is
 * the single place that graduates to a real queue (BullMQ) — nothing else changes.
 */
@Injectable()
export class IngestionScheduler {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly users: UsersRepositoryPort,
    private readonly orchestrator: IngestionOrchestrator,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runDaily(): Promise<void> {
    const userIds = await this.users.findActiveIds();
    this.logger.log(`Daily ingestion starting for ${userIds.length} users.`);

    for (const userId of userIds) {
      try {
        await this.orchestrator.runForUser(userId);
      } catch (err) {
        // Isolate per-tenant failures; the next user still runs.
        this.logger.error(
          `Ingestion failed for ${userId}: ${String(err)}`,
        );
      }
    }
  }
}
