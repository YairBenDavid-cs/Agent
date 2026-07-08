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
  /** Start instants (scheduledStartUtc) to skip — already offered and declined. */
  exclude?: string[];
  /**
   * Whole local dates (YYYY-MM-DD) to skip — days already holding a scheduled
   * session this week (one session per day).
   */
  excludeDates?: string[];
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * A deterministic reading of the user's free-text scheduling wish ("Monday
 * morning instead", "can we do 7pm?"): the weekday(s) they named and/or a local
 * time-of-day window. Empty wish = no constraint parsed from the message.
 */
export interface SlotWish {
  /** Named weekdays, as 'sun'..'sat'. Empty = no day constraint. */
  days: string[];
  /** Local wall-clock window in minutes-from-midnight, or null. */
  window: { startMin: number; endMin: number } | null;
  /**
   * A relative time wish ("later", "earlier") that only makes sense against the
   * slots already offered; the caller resolves it into a concrete window via
   * {@link resolveRelativeWish}. Null when the message named no relative shift.
   */
  relative: 'later' | 'earlier' | null;
}

const DAY_WORDS: Record<string, string> = {
  sunday: 'sun', sun: 'sun',
  monday: 'mon', mon: 'mon',
  tuesday: 'tue', tues: 'tue', tue: 'tue',
  wednesday: 'wed', wed: 'wed',
  thursday: 'thu', thurs: 'thu', thur: 'thu', thu: 'thu',
  friday: 'fri', fri: 'fri',
  saturday: 'sat', sat: 'sat',
};

const TIME_OF_DAY: Record<string, { startMin: number; endMin: number }> = {
  morning: { startMin: 4 * 60, endMin: 12 * 60 },
  noon: { startMin: 11 * 60, endMin: 14 * 60 },
  afternoon: { startMin: 12 * 60, endMin: 17 * 60 },
  evening: { startMin: 16 * 60, endMin: 22 * 60 },
  night: { startMin: 18 * 60, endMin: 24 * 60 },
};

/**
 * Parse a scheduling wish out of a free-text reply. Deterministic and
 * intentionally conservative: only explicit weekday names, time-of-day words,
 * and explicit clock times ("07:00", "7am", "7 pm") register — anything else
 * yields an empty wish (caller treats it as "these don't work, show me others").
 */
export function parseSlotWish(message?: string | null): SlotWish {
  const text = (message ?? '').toLowerCase();
  const days: string[] = [];
  for (const [word, day] of Object.entries(DAY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text) && !days.includes(day)) {
      days.push(day);
    }
  }

  let window: SlotWish['window'] = null;
  for (const [word, w] of Object.entries(TIME_OF_DAY)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      window = w;
      break;
    }
  }
  // Explicit clock time — "07:30", "7am", "7 pm". Centre a ±90 min window on it.
  const clock = /\b(\d{1,2}):(\d{2})\b/.exec(text);
  const ampm = /\b(\d{1,2})\s*(am|pm)\b/.exec(text);
  let minutes: number | null = null;
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    if (h < 24 && m < 60) minutes = h * 60 + m;
  } else if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[2] === 'pm') h += 12;
    minutes = h * 60;
  }
  if (minutes !== null) {
    window = {
      startMin: Math.max(0, minutes - 90),
      endMin: Math.min(24 * 60, minutes + 90),
    };
  }

  let relative: SlotWish['relative'] = null;
  if (/\blater\b/.test(text)) {
    relative = 'later';
  } else if (/\bearlier\b/.test(text)) {
    relative = 'earlier';
  }

  return { days, window, relative };
}

/**
 * Resolve a relative wish ("later" / "earlier") into a concrete window against
 * the start times ("HH:mm") of the slots already offered: later = strictly
 * after the latest offered start, earlier = strictly before the earliest. An
 * explicit window (time-of-day / clock time) wins over the relative word; a
 * wish with no relative part passes through unchanged.
 */
export function resolveRelativeWish(
  wish: SlotWish,
  offeredStartTimes: string[],
): SlotWish {
  if (!wish.relative || wish.window || offeredStartTimes.length === 0) {
    return wish;
  }
  const starts = offeredStartTimes.map(toMinutes);
  const window =
    wish.relative === 'later'
      ? { startMin: Math.max(...starts) + 1, endMin: 24 * 60 }
      : { startMin: 0, endMin: Math.min(...starts) };
  return { ...wish, window };
}

/** Whether a candidate satisfies a parsed wish (empty wish matches anything). */
export function matchesSlotWish(c: SlotCandidate, wish: SlotWish): boolean {
  if (wish.days.length > 0 && !wish.days.includes(weekdayOf(c.scheduledDate))) {
    return false;
  }
  if (wish.window) {
    const start = toMinutes(c.startTime);
    if (start < wish.window.startMin || start >= wish.window.endMin) {
      return false;
    }
  }
  return true;
}

/** True when the wish carries at least one parsed constraint. */
export function hasSlotWish(wish: SlotWish): boolean {
  return wish.days.length > 0 || wish.window !== null || wish.relative !== null;
}

/**
 * Whether one specific (date, startTime) fits entirely inside a matching
 * availability window with room for the duration. Returns the computed endTime
 * ("HH:mm") when it fits, null otherwise. Lets a user-requested off-grid time
 * (e.g. 07:15 when the pool steps :00/:30) be validated exactly.
 */
export function fitsAvailability(
  date: string,
  startTime: string,
  durationMin: number,
  availability: AvailabilityWindow[],
): string | null {
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return null;
  }
  const wd = weekdayOf(date);
  const start = toMinutes(startTime);
  const end = start + durationMin;
  if (end > 24 * 60) {
    return null;
  }
  for (const win of availability) {
    if (win.day !== '*' && win.day !== wd) {
      continue;
    }
    if (start >= toMinutes(win.start) && end <= toMinutes(win.end)) {
      return fromMinutes(end);
    }
  }
  return null;
}

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

/** Step between candidate start times inside one availability window. */
const WINDOW_STEP_MIN = 30;

/**
 * Generate ranked, clash-free candidate slots. Candidates are enumerated every
 * {@link WINDOW_STEP_MIN} minutes inside each (date, matching availability
 * window) as long as the session duration still fits — so a 06:00–08:00 window
 * yields 06:00, 06:30, 07:00… options, not only the window's start. Candidates
 * that clash with live busy blocks, hard windows, or wall-clock sanity are
 * dropped (validator-checked).
 */
export function proposeSlots(input: ProposeSlotsInput): SlotCandidate[] {
  const limit = input.limit ?? 3;
  const duration = input.durationMin;
  if (duration <= 0) {
    return [];
  }
  const excluded = new Set(input.exclude ?? []);
  const excludedDates = new Set(input.excludeDates ?? []);

  const candidates: SlotCandidate[] = [];
  for (const date of enumerateDates(input.weekWindow.from, input.weekWindow.to)) {
    if (excludedDates.has(date)) {
      continue;
    }
    const wd = weekdayOf(date);
    for (const win of input.availability) {
      if (win.day !== '*' && win.day !== wd) {
        continue;
      }
      const winStart = toMinutes(win.start);
      const winEnd = toMinutes(win.end);
      // Every step-aligned start the session still fits inside the window.
      for (
        let startMin = winStart;
        startMin + duration <= winEnd;
        startMin += WINDOW_STEP_MIN
      ) {
        const startTime = fromMinutes(startMin);
        const endTime = fromMinutes(startMin + duration);
        const scheduledStartUtc = toUtcInstant(date, startTime, input.timezone);

        // Reuse the irreversible-write guard: keep the candidate only if a
        // single-entry placement passes (no busy clash, no hard-window overlap,
        // sane tz).
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
        if (violations.length > 0 || excluded.has(scheduledStartUtc)) {
          continue;
        }
        candidates.push({ scheduledDate: date, startTime, endTime, scheduledStartUtc });
      }
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

  // Day diversity: surface each day's first option before any day's second, so
  // a default 3-pick proposal spans days instead of stacking one morning's
  // half-hour steps. Stable sort → prior ranking is preserved within tiers.
  const nthOfDay = new Map<string, number>();
  const tiered = candidates.map((c) => {
    const n = nthOfDay.get(c.scheduledDate) ?? 0;
    nthOfDay.set(c.scheduledDate, n + 1);
    return { c, n };
  });
  tiered.sort((a, b) => a.n - b.n);

  return tiered.map((t) => t.c).slice(0, limit);
}
