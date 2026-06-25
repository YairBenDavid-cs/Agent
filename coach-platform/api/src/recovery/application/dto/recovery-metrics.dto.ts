import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Published contract for a day's recovery readings (the ingestion input shape).
 * Every field is optional+nullable: a missing Garmin reading is expected.
 * @IsOptional permits both `undefined` and `null`.
 */
export class RecoveryMetricsDto {
  @IsOptional() @IsNumber() hrv_last_night?: number | null;
  @IsOptional() @IsString() hrv_status?: string | null;
  @IsOptional() @IsNumber() resting_hr?: number | null;
  @IsOptional() @IsNumber() sleep_score?: number | null;
  @IsOptional() @IsNumber() sleep_minutes?: number | null;
  @IsOptional() @IsNumber() sleep_deep_pct?: number | null;
  @IsOptional() @IsNumber() sleep_rem_pct?: number | null;
  @IsOptional() @IsNumber() training_readiness_score?: number | null;
  @IsOptional() @IsString() training_readiness_level?: string | null;
  @IsOptional() @IsNumber() recovery_time_min?: number | null;
  @IsOptional() @IsNumber() body_battery_morning_peak?: number | null;
  @IsOptional() @IsNumber() body_battery_lowest?: number | null;
  @IsOptional() @IsNumber() acute_load?: number | null;
  @IsOptional() @IsNumber() chronic_load?: number | null;
  @IsOptional() @IsNumber() acwr_ratio?: number | null;
  @IsOptional() @IsString() acwr_status?: string | null;
  @IsOptional() @IsString() training_status?: string | null;
  @IsOptional() @IsNumber() respiration_overnight_avg?: number | null;
  @IsOptional() @IsNumber() spo2_overnight_avg?: number | null;
  @IsOptional() @IsNumber() spo2_overnight_lowest?: number | null;
  @IsOptional() @IsNumber() stress_yesterday_avg?: number | null;
  @IsOptional() @IsNumber() rest_stress_minutes?: number | null;
  @IsOptional() @IsInt() intensity_min_moderate?: number | null;
  @IsOptional() @IsInt() intensity_min_vigorous?: number | null;
  @IsOptional() @IsNumber() hrv_baseline_low?: number | null;
  @IsOptional() @IsNumber() hrv_baseline_high?: number | null;
  @IsOptional() @IsNumber() sleep_need_minutes?: number | null;
}
