import {
  IngestionStatus,
  IngestionWarning,
  RecoveryMetrics,
} from '../../domain/recovery-day.model';

/** Result surfaced to the ingestion orchestrator for its run summary. */
export interface UpsertResult {
  written: boolean;
}

export class UpsertRecoveryDayCommand {
  constructor(
    public readonly userId: string,
    public readonly date: string,
    public readonly source: string,
    public readonly metrics: RecoveryMetrics,
    public readonly ingestionStatus: IngestionStatus,
    public readonly warnings: IngestionWarning[],
  ) {}
}
