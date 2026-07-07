/**
 * Pure candidate-slot generator for the conversational build's scheduling phase
 * (BW3). Given a user's recurring weekly availability, the target week window,
 * a session's duration, the LIVE busy intervals, and the HARD blocked windows,
 * it enumerates concrete local time slots that fit and don't clash, ranked so
 * the best handful surface as picks in chat.
 *
 * Clash detection reuses the Planner's pre-write validator verbatim (a candidate
 * is kept only if `validatePlacement` finds zero violations for it), so the
 * proposer and the irreversible write agree on what "free" means. Side-effect-
 * free + framework-free → unit-testable in isolation; the orchestrator supplies
 * the live calendar data.
 */

import { toUtcInstant } from '../../common/util/scheduling';
import {
  BusyInterval,
  HardWindow,
  validatePlacement,
} from '../planner/planner.prewrite-validator';

/** A recurring weekly availability window, local to the user's timezone. */
export interface AvailabilityWindow {
  day: string; // 'mon'..'sun' or '*'
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

/** One concrete, clash-free slot the user can pick. */
export interface SlotCandidate {
  scheduledDate: string; // YYYY-MM-DD (local)
  startTime: string; // "HH:mm" (local)
  endTime: string; // "HH:mm" (local)
  scheduledStartUtc: string; // ISO instant
}

export interface ProposeSlotsInput {
  /** Inclusive local week window, YYYY-MM-DD. */
  weekWindow: { from: string; to: string };
  availability: AvailabilityWindow[];
  durationMin: number;
  /** Live busy intervals (UTC instants) from the user's calendar. */
  busy: BusyInterval[];
  /** HARD recurring blocked windows (local wall-clock). */
  hardBlocked: HardWindow[];
  timezone: string;
  /** How many candidates to return (default 3). */
  limit?: number;
  /**
   * The session's soft day-type hint (its placeholder `scheduledDate`); used
   * only to rank candidates nearer that date first. Optional.
   */
  preferredDate?: string | null;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return WEEKDAYS[d.getUTCDay()];
}

/** Inclusive list of YYYY-MM-DD dates from `from` to `to`. */
function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return dates;
  }
  const DAY = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += DAY) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Generate ranked, clash-free candidate slots. One candidate is generated per
 * (date, matching availability window) at the window's start, provided the
 * session duration fits inside the window; candidates that clash with live busy
 * blocks, hard windows, or wall-clock sanity are dropped (validator-checked).
 */
export function proposeSlots(input: ProposeSlotsInput): SlotCandidate[] {
  const limit = input.limit ?? 3;
  const duration = input.durationMin;
  if (duration <= 0) {
    return [];
  }

  const candidates: SlotCandidate[] = [];
  for (const date of enumerateDates(input.weekWindow.from, input.weekWindow.to)) {
    const wd = weekdayOf(date);
    for (const win of input.availability) {
      if (win.day !== '*' && win.day !== wd) {
        continue;
      }
      const startMin = toMinutes(win.start);
      const endMin = startMin + duration;
      // Session must fit entirely inside the availability window.
      if (endMin > toMinutes(win.end)) {
        continue;
      }
      const startTime = fromMinutes(startMin);
      const endTime = fromMinutes(endMin);
      const scheduledStartUtc = toUtcInstant(date, startTime, input.timezone);

      // Reuse the irreversible-write guard: keep the candidate only if a single-
      // entry placement passes (no busy clash, no hard-window overlap, sane tz).
      const violations = validatePlacement({
        placed: [
          {
            plannedSessionId: 'candidate',
            scheduledDate: date,
            startTime,
            endTime,
            scheduledStartUtc,
          },
        ],
        busy: input.busy,
        hardBlocked: input.hardBlocked,
      });
      if (violations.length > 0) {
        continue;
      }
      candidates.push({ scheduledDate: date, startTime, endTime, scheduledStartUtc });
    }
  }

  // Rank: nearer the preferred date first (when given), then chronological.
  const preferredMs = input.preferredDate
    ? Date.parse(`${input.preferredDate}T00:00:00.000Z`)
    : NaN;
  candidates.sort((a, b) => {
    const at = Date.parse(a.scheduledStartUtc);
    const bt = Date.parse(b.scheduledStartUtc);
    if (!Number.isNaN(preferredMs)) {
      const ad = Math.abs(Date.parse(`${a.scheduledDate}T00:00:00.000Z`) - preferredMs);
      const bd = Math.abs(Date.parse(`${b.scheduledDate}T00:00:00.000Z`) - preferredMs);
      if (ad !== bd) {
        return ad - bd;
      }
    }
    return at - bt;
  });

  return candidates.slice(0, limit);
}
