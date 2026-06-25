import { IngestionWarning } from '../../domain/recovery-day.model';
import { RecoveryMetricsDto } from './recovery-metrics.dto';

/** Outward shape for a recovery day. No internal fields (content hash, _id). */
export class RecoveryDayResponse {
  date!: string;
  source!: string;
  ingestionStatus!: string;
  warnings!: IngestionWarning[];
  metrics!: RecoveryMetricsDto;
}
