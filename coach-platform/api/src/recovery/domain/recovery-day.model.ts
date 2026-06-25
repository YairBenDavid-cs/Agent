/**
 * Domain model for a single day's recovery snapshot. Framework-free: no Nest,
 * no Mongoose. All metric fields are nullable — Garmin frequently omits data,
 * and a missing reading is normal, not an error.
 */

export type IngestionStatus = 'ok' | 'partial' | 'failed';

export interface IngestionWarning {
  field: string;
  reason: string;
}

/**
 * Daily recovery readings + slow-moving personal baselines (HRV range, sleep
 * need) which, per the data model, live in the daily log rather than a profile.
 */
export interface RecoveryMetrics {
  // daily readings
  hrv_last_night: number | null;
  hrv_status: string | null;
  resting_hr: number | null;
  sleep_score: number | null;
  sleep_minutes: number | null;
  sleep_deep_pct: number | null;
  sleep_rem_pct: number | null;
  training_readiness_score: number | null;
  training_readiness_level: string | null;
  recovery_time_min: number | null;
  body_battery_morning_peak: number | null;
  body_battery_lowest: number | null;
  acute_load: number | null;
  chronic_load: number | null;
  acwr_ratio: number | null;
  acwr_status: string | null;
  training_status: string | null;
  respiration_overnight_avg: number | null;
  spo2_overnight_avg: number | null;
  spo2_overnight_lowest: number | null;
  stress_yesterday_avg: number | null;
  rest_stress_minutes: number | null;
  intensity_min_moderate: number | null;
  intensity_min_vigorous: number | null;
  // slow-moving personal baselines
  hrv_baseline_low: number | null;
  hrv_baseline_high: number | null;
  sleep_need_minutes: number | null;
}

export interface RecoveryDay {
  userId: string;
  date: string; // YYYY-MM-DD (local day the metrics belong to)
  source: string;
  contentHash: string;
  ingestionStatus: IngestionStatus;
  warnings: IngestionWarning[];
  metrics: RecoveryMetrics;
}
