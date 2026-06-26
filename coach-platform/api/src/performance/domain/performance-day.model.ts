import {
  IngestionStatus,
  IngestionWarning,
} from '../../recovery/domain/recovery-day.model';

/**
 * Daily performance = the weekly rolling aggregates Garmin recomputes each day.
 * Slow-moving fitness markers (VO2max, race predictions, 1RMs) do NOT live here;
 * they go to the performance profile change-log.
 */
export interface PerformanceRunningDaily {
  running_tolerance: number | null;
  weekly_distance_km: number | null;
  weekly_intensity_moderate: number | null;
  weekly_intensity_vigorous: number | null;
}

export interface PerformanceStrengthDaily {
  weekly_volume_load: number | null;
}

export interface PerformanceMetrics {
  running: PerformanceRunningDaily;
  strength: PerformanceStrengthDaily;
}

export interface PerformanceDay {
  userId: string;
  date: string;
  source: string;
  contentHash: string;
  ingestionStatus: IngestionStatus;
  warnings: IngestionWarning[];
  metrics: PerformanceMetrics;
}
