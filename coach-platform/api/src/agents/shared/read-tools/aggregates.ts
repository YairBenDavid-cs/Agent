import { PlannedSessionResponse } from '../../../planned-sessions/application/dto/planned-session.response';
import { RecoveryDayResponse } from '../../../recovery/application/dto/recovery-day.response';

/**
 * Pure aggregation helpers backing the `query_adherence` and `query_cross_source`
 * read-tools (Orchestrator Q5). These are retrieval-side composition over data
 * the agents already have access to — NOT judgment. Kept framework-free and
 * unit-tested so the numbers are trustworthy.
 */

export interface AdherenceSummary {
  totalPlanned: number;
  completed: number;
  partiallyCompleted: number;
  skipped: number;
  deviated: number;
  /** completed / totalPlanned, 0..1 (null when nothing was planned). */
  completionRate: number | null;
  /** Count of skips/deviations by structured reason code. */
  reasonCounts: Record<string, number>;
  /** exerciseId/title → times it appeared in a skipped/deviated session. */
  mostSkipped: Array<{ key: string; count: number }>;
  /** Time-of-day bucket → skip count (morning/afternoon/evening). */
  skippedByTimeOfDay: Record<string, number>;
}

function timeBucket(startTime: string | undefined): string {
  if (!startTime) return 'unknown';
  const hour = parseInt(startTime.slice(0, 2), 10);
  if (Number.isNaN(hour)) return 'unknown';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function sessionLabel(s: PlannedSessionResponse): string {
  return s.title || s.type;
}

export function computeAdherence(
  sessions: PlannedSessionResponse[],
): AdherenceSummary {
  const reasonCounts: Record<string, number> = {};
  const skippedByTimeOfDay: Record<string, number> = {};
  const skippedTally = new Map<string, number>();
  let completed = 0;
  let partiallyCompleted = 0;
  let skipped = 0;
  let deviated = 0;

  for (const s of sessions) {
    const status = s.outcome?.status;
    switch (status) {
      case 'completed':
        completed += 1;
        break;
      case 'partially_completed':
        partiallyCompleted += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'deviated':
        deviated += 1;
        break;
      default:
        break;
    }
    const isNegative = status === 'skipped' || status === 'deviated';
    if (isNegative) {
      const reason = s.outcome?.reasonCode ?? 'unspecified';
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      const bucket = timeBucket(s.startTime);
      skippedByTimeOfDay[bucket] = (skippedByTimeOfDay[bucket] ?? 0) + 1;
      const label = sessionLabel(s);
      skippedTally.set(label, (skippedTally.get(label) ?? 0) + 1);
    }
  }

  const totalPlanned = sessions.length;
  const mostSkipped = [...skippedTally.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalPlanned,
    completed,
    partiallyCompleted,
    skipped,
    deviated,
    completionRate: totalPlanned === 0 ? null : completed / totalPlanned,
    reasonCounts,
    mostSkipped,
    skippedByTimeOfDay,
  };
}

export interface CrossSourceRow {
  date: string;
  plannedStatus: string | null;
  perceivedEffort: number | null;
  enjoyment: number | null;
  trainingReadiness: number | null;
  hrvLastNight: number | null;
  acwrRatio: number | null;
}

export interface CrossSourceResult {
  rows: CrossSourceRow[];
  /** Mean RPE on days where readiness was below the median, vs at/above. */
  avgRpeLowReadiness: number | null;
  avgRpeHighReadiness: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Join planned outcomes with recovery by date so an agent can answer
 * correlation questions ("too hard when HRV is low?"). Returns the joined rows
 * plus one cheap derived split (RPE on low- vs high-readiness days).
 */
export function computeCrossSource(
  planned: PlannedSessionResponse[],
  recovery: RecoveryDayResponse[],
): CrossSourceResult {
  const recoveryByDate = new Map(recovery.map((r) => [r.date, r]));
  const rows: CrossSourceRow[] = planned.map((p) => {
    const rec = recoveryByDate.get(p.scheduledDate);
    return {
      date: p.scheduledDate,
      plannedStatus: p.outcome?.status ?? null,
      perceivedEffort: p.outcome?.perceivedEffort ?? null,
      enjoyment: p.outcome?.enjoyment ?? null,
      trainingReadiness: rec?.metrics?.training_readiness_score ?? null,
      hrvLastNight: rec?.metrics?.hrv_last_night ?? null,
      acwrRatio: rec?.metrics?.acwr_ratio ?? null,
    };
  });

  const withReadiness = rows.filter(
    (r) => r.trainingReadiness != null && r.perceivedEffort != null,
  );
  const readinessValues = withReadiness
    .map((r) => r.trainingReadiness as number)
    .sort((a, b) => a - b);
  const median =
    readinessValues.length === 0
      ? null
      : readinessValues[Math.floor(readinessValues.length / 2)];

  const lowRpe: number[] = [];
  const highRpe: number[] = [];
  if (median != null) {
    for (const r of withReadiness) {
      const rpe = r.perceivedEffort as number;
      if ((r.trainingReadiness as number) < median) lowRpe.push(rpe);
      else highRpe.push(rpe);
    }
  }

  return {
    rows,
    avgRpeLowReadiness: mean(lowRpe),
    avgRpeHighReadiness: mean(highRpe),
  };
}
