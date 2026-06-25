import { IngestionWarning } from '../../../recovery/domain/recovery-day.model';
import { PerformanceMetricsDto } from './performance-metrics.dto';

export class PerformanceDayResponse {
  date!: string;
  source!: string;
  ingestionStatus!: string;
  warnings!: IngestionWarning[];
  metrics!: PerformanceMetricsDto;
}

export class ProfileCurrentResponse {
  metric!: string;
  value!: number;
  effectiveDate!: string;
}

export class MetricHistoryPointResponse {
  value!: number;
  effectiveDate!: string;
}
