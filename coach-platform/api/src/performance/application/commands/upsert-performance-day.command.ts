import {
  IngestionStatus,
  IngestionWarning,
} from '../../../recovery/domain/recovery-day.model';
import { PerformanceMetrics } from '../../domain/performance-day.model';

export interface UpsertResult {
  written: boolean;
}

export class UpsertPerformanceDayCommand {
  constructor(
    public readonly userId: string,
    public readonly date: string,
    public readonly source: string,
    public readonly metrics: PerformanceMetrics,
    public readonly ingestionStatus: IngestionStatus,
    public readonly warnings: IngestionWarning[],
  ) {}
}
