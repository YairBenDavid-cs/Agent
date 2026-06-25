import { RecoveryDay, RecoveryMetrics } from '../domain/recovery-day.model';
import { RecoveryDayResponse } from './dto/recovery-day.response';
import { RecoveryMetricsDto } from './dto/recovery-metrics.dto';

/** Canonical empty snapshot — every field present and null. */
const EMPTY_METRICS: RecoveryMetrics = {
  hrv_last_night: null,
  hrv_status: null,
  resting_hr: null,
  sleep_score: null,
  sleep_minutes: null,
  sleep_deep_pct: null,
  sleep_rem_pct: null,
  training_readiness_score: null,
  training_readiness_level: null,
  recovery_time_min: null,
  body_battery_morning_peak: null,
  body_battery_lowest: null,
  acute_load: null,
  chronic_load: null,
  acwr_ratio: null,
  acwr_status: null,
  training_status: null,
  respiration_overnight_avg: null,
  spo2_overnight_avg: null,
  spo2_overnight_lowest: null,
  stress_yesterday_avg: null,
  rest_stress_minutes: null,
  intensity_min_moderate: null,
  intensity_min_vigorous: null,
  hrv_baseline_low: null,
  hrv_baseline_high: null,
  sleep_need_minutes: null,
};

/** Normalize a partial ingestion DTO into a complete, null-filled snapshot. */
export const metricsFromDto = (dto: RecoveryMetricsDto): RecoveryMetrics => {
  const result: RecoveryMetrics = { ...EMPTY_METRICS };
  for (const key of Object.keys(EMPTY_METRICS) as (keyof RecoveryMetrics)[]) {
    const value = dto[key];
    if (value !== undefined) {
      (result[key] as unknown) = value;
    }
  }
  return result;
};

export const toRecoveryDayResponse = (day: RecoveryDay): RecoveryDayResponse => ({
  date: day.date,
  source: day.source,
  ingestionStatus: day.ingestionStatus,
  warnings: day.warnings,
  metrics: day.metrics,
});
