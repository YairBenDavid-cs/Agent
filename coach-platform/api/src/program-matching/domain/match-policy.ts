/**
 * Pure matching policy — no I/O, no framework. Decides (a) which planned train
 * an observed session attaches to, and (b) the resulting adherence status.
 *
 * Kept framework-free so the rules are unit-testable in isolation and can be
 * tuned without touching persistence or event wiring.
 */

import { PlannedSession } from '../../planned-sessions/domain/planned-session.model';
import { PlannedStatus } from '../../planned-sessions/domain/planned-session.model';
import { WorkoutSession } from '../../sessions/domain/workout-session.model';

/** Trains scheduled within this many days of the session are eligible. */
export const MATCH_WINDOW_DAYS = 1;

/** Completed if the achieved fraction of the target is at least this. */
const COMPLETED_FRACTION = 0.8;
/** Partially completed down to this fraction; below it counts as deviated. */
const PARTIAL_FRACTION = 0.4;

const dayDiff = (a: string, b: string): number => {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
};

/**
 * Pick the best planned train for an observed session from already-filtered
 * candidates (same user + same type + still 'planned'). Closest scheduled date
 * wins; ties break toward the earlier schedule. Returns null if none are within
 * the window.
 */
export const selectCandidate = (
  session: WorkoutSession,
  candidates: PlannedSession[],
): PlannedSession | null => {
  let best: PlannedSession | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (c.type !== session.type) continue;
    if (c.outcome.status !== 'planned') continue;
    if (c.outcome.matchedActivityId != null) continue;
    const diff = dayDiff(c.scheduledDate, session.date);
    if (diff > MATCH_WINDOW_DAYS) continue;
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
};

/** Achieved fraction of the planned volume, or null if no target to compare. */
const achievedFraction = (
  planned: PlannedSession,
  actual: WorkoutSession,
): number | null => {
  if (planned.type === 'running' && planned.running && actual.running) {
    const targetKm = planned.running.totalDistanceKm;
    if (targetKm && targetKm > 0 && actual.running.distance_km != null) {
      return actual.running.distance_km / targetKm;
    }
    const targetMin = planned.running.totalDurationMin;
    if (targetMin && targetMin > 0 && actual.running.duration_min != null) {
      return actual.running.duration_min / targetMin;
    }
  }
  if (planned.type === 'strength' && planned.strength && actual.strength) {
    const targetVol = planned.strength.targetVolumeLoad;
    if (
      targetVol &&
      targetVol > 0 &&
      actual.strength.session_volume_load != null
    ) {
      return actual.strength.session_volume_load / targetVol;
    }
  }
  return null;
};

/**
 * Adherence status for a matched (planned, actual) pair. With no quantitative
 * target to compare against, a same-type session on/near the day counts as
 * `completed`.
 */
export const deriveStatus = (
  planned: PlannedSession,
  actual: WorkoutSession,
): PlannedStatus => {
  const fraction = achievedFraction(planned, actual);
  if (fraction == null) {
    return 'completed';
  }
  if (fraction >= COMPLETED_FRACTION) return 'completed';
  if (fraction >= PARTIAL_FRACTION) return 'partially_completed';
  return 'deviated';
};
