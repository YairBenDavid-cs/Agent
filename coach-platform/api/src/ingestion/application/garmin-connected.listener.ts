import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  GARMIN_CONNECTED,
  GarminConnectedEvent,
} from '../../integrations/application/events/garmin-connected.event';
import { IngestionOrchestrator } from './ingestion.orchestrator';

/**
 * Runs an initial ingestion as soon as a user connects Garmin. The orchestrator
 * fetches via the Python service, persists the user's recovery/performance/
 * sessions, and caches the freshly minted Garmin session token. Failures (e.g.
 * bad credentials) are isolated and logged so they never surface as an unhandled
 * rejection from the fire-and-forget emit on the connect path.
 */
@Injectable()
export class GarminConnectedListener {
  private readonly logger = new Logger(GarminConnectedListener.name);

  constructor(private readonly orchestrator: IngestionOrchestrator) {}

  @OnEvent(GARMIN_CONNECTED)
  async handle(event: GarminConnectedEvent): Promise<void> {
    try {
      const summary = await this.orchestrator.runForUser(event.userId);
      this.logger.log(
        `Initial Garmin ingestion for ${event.userId}: ${JSON.stringify(summary)}`,
      );
    } catch (err) {
      this.logger.error(
        `Initial Garmin ingestion failed for ${event.userId}: ${String(err)}`,
      );
    }
  }
}
