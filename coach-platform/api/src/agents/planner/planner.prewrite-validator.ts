/**
 * The Planner's pre-write validator — the code guard on the irreversible write.
 * The LLM makes the full placement decision; this never *decides* placement, it
 * only REFUSES to persist an invalid one and bounces a precise reason back into
 * the loop so the model re-decides (defense in depth).
 *
 * Pure + framework-free so it is trivially unit-testable.
 */

export interface PlacementEntry {
  plannedSessionId: string;
  scheduledDate: string; // YYYY-MM-DD (local)
  startTime: string; // "HH:mm" (local)
  endTime: string; // "HH:mm" (local)
  scheduledStartUtc: string; // ISO instant
}

/** A real busy block from the user's live calendar, as UTC instants. */
export interface BusyInterval {
  startUtc: string;
  endUtc: string;
}

/** A recurring HARD blocked window (local wall-clock). day = 'mon'..'sun' or '*'. */
export interface HardWindow {
  day: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface PlacementValidationInput {
  placed: PlacementEntry[];
  busy: BusyInterval[];
  hardBlocked: HardWindow[];
}

/** Minimum hours between the starts of any two placed sessions (recovery gap). */
export const MIN_RECOVERY_GAP_HOURS = 12;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return WEEKDAYS[d.getUTCDay()];
}

/** [startMs, endMs) for a placed entry, derived from its UTC start + duration. */
function utcInterval(e: PlacementEntry): { start: number; end: number } | null {
  const start = Date.parse(e.scheduledStartUtc);
  if (Number.isNaN(start)) return null;
  const durationMin = toMinutes(e.endTime) - toMinutes(e.startTime);
  if (durationMin <= 0) return null;
  return { start, end: start + durationMin * 60_000 };
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Returns a list of human-readable violations; empty = safe to persist. */
export function validatePlacement(input: PlacementValidationInput): string[] {
  const violations: string[] = [];
  const intervals: Array<{ entry: PlacementEntry; iv: { start: number; end: number } }> = [];

  for (const e of input.placed) {
    // 1. Wall-clock sanity: end strictly after start.
    if (toMinutes(e.endTime) <= toMinutes(e.startTime)) {
      violations.push(
        `Session ${e.plannedSessionId}: endTime ${e.endTime} not after startTime ${e.startTime}.`,
      );
      continue;
    }
    // 2. tz->UTC sanity: scheduledStartUtc must parse.
    const iv = utcInterval(e);
    if (!iv) {
      violations.push(
        `Session ${e.plannedSessionId}: scheduledStartUtc "${e.scheduledStartUtc}" is not a valid instant.`,
      );
      continue;
    }
    intervals.push({ entry: e, iv });

    // 3. HARD blocked-window violation (by weekday + local time overlap).
    const wd = weekdayOf(e.scheduledDate);
    const sMin = toMinutes(e.startTime);
    const eMin = toMinutes(e.endTime);
    for (const w of input.hardBlocked) {
      if (w.day !== '*' && w.day !== wd) continue;
      if (sMin < toMinutes(w.end) && toMinutes(w.start) < eMin) {
        violations.push(
          `Session ${e.plannedSessionId} falls inside a HARD blocked window (${w.day} ${w.start}-${w.end}).`,
        );
      }
    }

    // 4. Calendar overlap with a real busy block.
    for (const b of input.busy) {
      const bs = Date.parse(b.startUtc);
      const be = Date.parse(b.endUtc);
      if (Number.isNaN(bs) || Number.isNaN(be)) continue;
      if (overlaps(iv, { start: bs, end: be })) {
        violations.push(
          `Session ${e.plannedSessionId} clashes with a busy calendar block (${b.startUtc}).`,
        );
      }
    }
  }

  // 5. No two placed sessions may overlap each other.
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      if (overlaps(intervals[i].iv, intervals[j].iv)) {
        violations.push(
          `Sessions ${intervals[i].entry.plannedSessionId} and ${intervals[j].entry.plannedSessionId} overlap each other.`,
        );
      }
    }
  }

  // 6. One session per local day — two sessions on the same date is never a
  //    valid week, even if their times don't overlap.
  const byDate = new Map<string, PlacementEntry>();
  for (const e of input.placed) {
    const prior = byDate.get(e.scheduledDate);
    if (prior) {
      violations.push(
        `Sessions ${prior.plannedSessionId} and ${e.plannedSessionId} are both on ${e.scheduledDate} — only one session per day.`,
      );
    } else {
      byDate.set(e.scheduledDate, e);
    }
  }

  // 7. Minimum recovery gap between the starts of consecutive sessions.
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      // Same-date pairs are already reported by check 6 — don't double-report.
      if (a.entry.scheduledDate === b.entry.scheduledDate) continue;
      const gapHours = Math.abs(a.iv.start - b.iv.start) / 3_600_000;
      if (gapHours < MIN_RECOVERY_GAP_HOURS) {
        violations.push(
          `Sessions ${a.entry.plannedSessionId} and ${b.entry.plannedSessionId} start only ${Math.round(gapHours * 10) / 10}h apart — minimum recovery gap is ${MIN_RECOVERY_GAP_HOURS}h.`,
        );
      }
    }
  }

  return violations;
}
