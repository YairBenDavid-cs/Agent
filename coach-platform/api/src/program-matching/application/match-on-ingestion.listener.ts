import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  INGESTION_COMPLETED,
  IngestionCompletedEvent,
} from '../../ingestion/application/events/ingestion-completed.event';
import { SessionMatcherService } from './session-matcher.service';

/**
 * After each ingestion run, reconcile the freshly-written sessions against the
 * user's planned trains. Hooks the existing `ingestion.completed` seam so the
 * orchestrator stays unaware of matching. Failures are isolated and logged so a
 * matcher error never breaks the ingestion path.
 */
@Injectable()
export class MatchOnIngestionListener {
  private readonly logger = new Logger(MatchOnIngestionListener.name);

  constructor(private readonly matcher: SessionMatcherService) {}

  @OnEvent(INGESTION_COMPLETED)
  async handle(event: IngestionCompletedEvent): Promise<void> {
    const { userId, from, to } = event.summary;
    try {
      await this.matcher.reconcile(userId, from, to);
    } catch (err) {
      this.logger.error(
        `Plan matching failed for ${userId} [${from}..${to}]: ${String(err)}`,
      );
    }
  }
}
