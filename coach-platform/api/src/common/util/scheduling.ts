/**
 * Pure scheduling helpers shared by the program / planned-session contexts.
 * No I/O, no Nest, no Mongoose — just date math, so they're trivially testable.
 *
 * A planned train is authored in the user's *local* wall-clock (a date + time
 * in their IANA timezone). For correct ordering, reminders, and "is it past
 * due?" checks across DST boundaries we also need the absolute UTC instant.
 * `toUtcInstant` derives it without pulling in a date library.
 */

/** "YYYY-MM-DD" + "HH:mm" (local to `timezone`) -> ISO-8601 UTC instant. */
export const toUtcInstant = (
  date: string,
  time: string,
  timezone: string,
): string => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  // Naive UTC guess for the wall-clock components.
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // How far the target timezone sits from UTC at that instant.
  const offsetMs = tzOffsetMs(guess, timezone);

  // Subtract the offset so the wall-clock reads correctly in `timezone`.
  return new Date(guess - offsetMs).toISOString();
};

/**
 * Offset (ms) of `timezone` from UTC at the given instant. Positive east of
 * UTC. Uses `Intl` parts to read the zone's local wall-clock, then diffs it
 * against the same instant interpreted as UTC.
 */
const tzOffsetMs = (utcMs: number, timezone: string): number => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = Number(p.value);
    }
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUtc - utcMs;
};

/**
 * Deterministic per-train idempotency key within a program week. Re-running the
 * (future) generator with the same inputs yields the same key, so the unique
 * index `{ program_id, week_index, slot_key }` blocks duplicate inserts.
 *
 * Shape: "<weekDay>:<discipline-discriminant>:<ordinal>" — e.g. "tue:intervals:0"
 * or "thu:push:1". The ordinal disambiguates two trains of the same kind on the
 * same day.
 */
export const slotKey = (
  weekDay: string,
  discriminant: string,
  ordinal = 0,
): string => `${weekDay}:${discriminant}:${ordinal}`;
