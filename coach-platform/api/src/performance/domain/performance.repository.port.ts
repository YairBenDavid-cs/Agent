import { PerformanceDay } from './performance-day.model';
import {
  ProfileMetricChange,
  ProfileMetricCurrent,
} from './profile-change.model';

export const PERFORMANCE_DAILY_REPOSITORY = Symbol(
  'PERFORMANCE_DAILY_REPOSITORY',
);
export const PERFORMANCE_PROFILE_REPOSITORY = Symbol(
  'PERFORMANCE_PROFILE_REPOSITORY',
);

export interface PerformanceDailyRepositoryPort {
  upsertDay(day: PerformanceDay): Promise<void>;
  getContentHash(userId: string, date: string): Promise<string | null>;
  findRange(
    userId: string,
    from: string,
    to: string,
    afterDate: string | null,
    limit: number,
  ): Promise<PerformanceDay[]>;
}

export interface PerformanceProfileRepositoryPort {
  /** Latest recorded value for a metric, or null if never recorded. */
  getLatestValue(userId: string, metric: string): Promise<number | null>;

  /** Append a change entry (caller has already decided it IS a change). */
  appendChange(change: ProfileMetricChange): Promise<void>;

  /** Current value of every metric (latest entry per metric). */
  getCurrentProfile(userId: string): Promise<ProfileMetricCurrent[]>;

  /** Full ascending history for one metric (for trend charts). */
  findMetricHistory(
    userId: string,
    metric: string,
  ): Promise<ProfileMetricChange[]>;
}
