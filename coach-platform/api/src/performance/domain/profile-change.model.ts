/**
 * One entry in the per-metric change-log. A new row is appended ONLY when the
 * value actually changes (see AppendProfileChangesHandler), giving cheap trend
 * history without write amplification.
 *
 * `metric` examples: "vo2max", "lt_hr", "race_pred_5k_sec", "endurance_score",
 * "1rm.SQUAT", "1rm.BENCH_PRESS".
 */
export interface ProfileMetricChange {
  userId: string;
  metric: string;
  value: number;
  effectiveDate: string; // YYYY-MM-DD when the change was observed
  source: string;
}

/** A point-in-time value the fetcher observed; may or may not be a change. */
export interface ProfileMetricCandidate {
  metric: string;
  value: number;
  effectiveDate: string;
}

/** Current value of a single metric (latest entry in its log). */
export interface ProfileMetricCurrent {
  metric: string;
  value: number;
  effectiveDate: string;
}
