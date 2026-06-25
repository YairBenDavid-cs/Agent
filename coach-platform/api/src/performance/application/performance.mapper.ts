import { PerformanceDay, PerformanceMetrics } from '../domain/performance-day.model';
import {
  ProfileMetricChange,
  ProfileMetricCurrent,
} from '../domain/profile-change.model';
import { PerformanceMetricsDto } from './dto/performance-metrics.dto';
import {
  MetricHistoryPointResponse,
  PerformanceDayResponse,
  ProfileCurrentResponse,
} from './dto/performance.responses';

export const metricsFromDto = (
  dto: PerformanceMetricsDto,
): PerformanceMetrics => ({
  running: {
    running_tolerance: dto.running?.running_tolerance ?? null,
    weekly_distance_km: dto.running?.weekly_distance_km ?? null,
    weekly_intensity_moderate: dto.running?.weekly_intensity_moderate ?? null,
    weekly_intensity_vigorous: dto.running?.weekly_intensity_vigorous ?? null,
  },
  strength: {
    weekly_volume_load: dto.strength?.weekly_volume_load ?? null,
  },
});

export const toPerformanceDayResponse = (
  day: PerformanceDay,
): PerformanceDayResponse => ({
  date: day.date,
  source: day.source,
  ingestionStatus: day.ingestionStatus,
  warnings: day.warnings,
  metrics: day.metrics,
});

export const toProfileCurrentResponse = (
  current: ProfileMetricCurrent,
): ProfileCurrentResponse => ({
  metric: current.metric,
  value: current.value,
  effectiveDate: current.effectiveDate,
});

export const toMetricHistoryPoint = (
  change: ProfileMetricChange,
): MetricHistoryPointResponse => ({
  value: change.value,
  effectiveDate: change.effectiveDate,
});
