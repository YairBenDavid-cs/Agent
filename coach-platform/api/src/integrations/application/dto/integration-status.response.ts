import {
  GarminSyncStatus,
  IntegrationProvider,
} from '../../domain/integration.model';

/** Secret-free view returned by the API. */
export class IntegrationStatusResponse {
  provider!: IntegrationProvider;
  connected!: boolean;
  updatedAt!: string | null;
  /** Garmin only — latest ingestion run status; `null` for other providers. */
  syncStatus?: GarminSyncStatus | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}
