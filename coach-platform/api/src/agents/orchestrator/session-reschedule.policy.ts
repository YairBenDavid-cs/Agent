import { toUtcInstant } from '../../common/util/scheduling';
import { MIN_RECOVERY_GAP_HOURS } from '../planner/planner.prewrite-validator';

/**
 * Pure validation for the deterministic SESSION_RESCHEDULE pipeline: a single
 * session moves to a new day and/or start time with NO LLM involved. Code
 * computes the new schedule and refuses moves that break the two hard training
 * constraints — one session per day, and a minimum recovery gap between
 * consecutive session starts. Framework-free so it is trivially unit-testable.
 */

export { MIN_RECOVERY_GAP_HOURS };

/** The other sessions of the week the move is validated against. */
export interface RescheduleNeighbor {
  id: string;
  title: string;
  scheduledDate: string; // YYYY-MM-DD (local)
  scheduledStartUtc: string; // ISO instant
}

export interface RescheduleTarget {
  plannedSessionId: string;
  newDate: string; // YYYY-MM-DD (local)
  newStartTime: string; // "HH:mm" (local)
  timezone: string;
  estDurationMin: number;
}

export interface ResolvedReschedule {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  scheduledStartUtc: string;
}

/**
 * Compute the full new schedule (end time + UTC instant derived) and validate
 * it against the rest of the week. Returns either the schedule to persist or
 * the list of human-readable violations (empty schedule ↔ non-empty violations).
 */
export function resolveSessionReschedule(
  target: RescheduleTarget,
  neighbors: RescheduleNeighbor[],
): { schedule: ResolvedReschedule | null; violations: string[] } {
  const violations: string[] = [];

  const endTime = addMinutes(target.newStartTime, target.estDurationMin);
  if (endTime === null) {
    violations.push(
      `Starting at ${target.newStartTime} the session (${target.estDurationMin} min) would run past midnight — pick an earlier start.`,
    );
    return { schedule: null, violations };
  }

  const newStartUtc = toUtcInstant(
    target.newDate,
    target.newStartTime,
    target.timezone,
  );
  const newStartMs = Date.parse(newStartUtc);

  for (const other of neighbors) {
    if (other.id === target.plannedSessionId) {
      continue;
    }
    // Hard rule 1: one session per day.
    if (other.scheduledDate === target.newDate) {
      violations.push(
        `${target.newDate} already has "${other.title}" scheduled — only one session per day.`,
      );
      continue;
    }
    // Hard rule 2: minimum recovery gap between session starts.
    const otherMs = Date.parse(other.scheduledStartUtc);
    if (Number.isNaN(otherMs)) {
      continue;
    }
    const gapHours = Math.abs(newStartMs - otherMs) / 3_600_000;
    if (gapHours < MIN_RECOVERY_GAP_HOURS) {
      violations.push(
        `Too close to "${other.title}" (${other.scheduledDate}) — only ${round1(gapHours)}h apart, minimum recovery gap is ${MIN_RECOVERY_GAP_HOURS}h.`,
      );
    }
  }

  if (violations.length > 0) {
    return { schedule: null, violations };
  }

  return {
    schedule: {
      scheduledDate: target.newDate,
      startTime: target.newStartTime,
      endTime,
      timezone: target.timezone,
      scheduledStartUtc: newStartUtc,
    },
    violations: [],
  };
}

/** "HH:mm" + minutes → "HH:mm", or null if the result crosses midnight. */
function addMinutes(time: string, minutes: number): string | null {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) {
    return null;
  }
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
