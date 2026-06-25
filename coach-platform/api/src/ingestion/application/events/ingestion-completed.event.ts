import { IngestionSummary } from '../ingestion.summary';

export const INGESTION_COMPLETED = 'ingestion.completed';

/**
 * Emitted after a user's ingestion run finishes. Today nothing critical listens;
 * this is the seam where the future coach Agent (and notifications) will hook in
 * without the orchestrator needing to know about them.
 */
export class IngestionCompletedEvent {
  constructor(public readonly summary: IngestionSummary) {}
}
