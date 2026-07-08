import {
  fitsAvailability,
  hasSlotWish,
  matchesSlotWish,
  parseSlotWish,
  proposeSlots,
  resolveRelativeWish,
  SlotCandidate,
} from '../slot-proposer';

describe('slot-proposer', () => {
  // Mon 2026-07-06 .. Sun 2026-07-12. UTC timezone keeps local == UTC so the
  // expected instants are easy to reason about.
  const weekWindow = { from: '2026-07-06', to: '2026-07-12' };

  it('steps every 30 min inside each matching availability window', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [
        { day: 'mon', start: '07:00', end: '09:00' }, // fits 07:00, 07:30, 08:00
        { day: 'wed', start: '18:00', end: '19:30' }, // fits 18:00, 18:30
      ],
      durationMin: 60,
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
      limit: 10,
    });

    expect(slots).toHaveLength(5);
    // Day diversity: each day's first option leads, later steps follow.
    expect(slots[0]).toMatchObject({
      scheduledDate: '2026-07-06',
      startTime: '07:00',
      endTime: '08:00',
      scheduledStartUtc: '2026-07-06T07:00:00.000Z',
    });
    expect(slots[1]).toMatchObject({
      scheduledDate: '2026-07-08',
      startTime: '18:00',
      endTime: '19:00',
    });
    const starts = slots.map((s) => `${s.scheduledDate} ${s.startTime}`);
    expect(starts).toContain('2026-07-06 07:30');
    expect(starts).toContain('2026-07-06 08:00');
    expect(starts).toContain('2026-07-08 18:30');
  });

  it('drops a window the session cannot fit inside', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [{ day: 'mon', start: '07:00', end: '07:30' }],
      durationMin: 60, // needs 60m, window is only 30m
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
    });
    expect(slots).toHaveLength(0);
  });

  it('drops a candidate that clashes with a live busy block', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [{ day: 'mon', start: '07:00', end: '09:00' }],
      durationMin: 60,
      busy: [
        { startUtc: '2026-07-06T07:30:00.000Z', endUtc: '2026-07-06T08:30:00.000Z' },
      ],
      hardBlocked: [],
      timezone: 'UTC',
    });
    expect(slots).toHaveLength(0);
  });

  it('drops candidates overlapping a HARD blocked window, keeps the rest', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [{ day: 'mon', start: '07:00', end: '09:00' }],
      durationMin: 60,
      busy: [],
      hardBlocked: [{ day: 'mon', start: '06:00', end: '08:00' }],
      timezone: 'UTC',
    });
    // 07:00 and 07:30 overlap the hard window; 08:00–09:00 does not.
    expect(slots.map((s) => s.startTime)).toEqual(['08:00']);
  });

  it('ranks candidates nearest the preferred date first, then chronologically', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [
        { day: 'mon', start: '07:00', end: '08:30' }, // 2026-07-06
        { day: 'fri', start: '07:00', end: '08:30' }, // 2026-07-10
        { day: 'wed', start: '07:00', end: '08:30' }, // 2026-07-08
      ],
      durationMin: 60,
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
      preferredDate: '2026-07-08',
      limit: 3,
    });
    // Wednesday (the preferred date) ranks first.
    expect(slots[0].scheduledDate).toBe('2026-07-08');
  });

  it('honours the limit', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [{ day: '*', start: '07:00', end: '08:30' }],
      durationMin: 60,
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
      limit: 2,
    });
    expect(slots).toHaveLength(2);
  });

  it('skips whole days that already hold a scheduled session', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [
        { day: 'mon', start: '07:00', end: '08:30' },
        { day: 'wed', start: '07:00', end: '08:30' },
      ],
      durationMin: 60,
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
      limit: 10,
      excludeDates: ['2026-07-06'], // Monday is taken
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.scheduledDate === '2026-07-08')).toBe(true);
  });

  it('skips excluded start instants (already offered and declined)', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [
        { day: 'mon', start: '07:00', end: '08:30' },
        { day: 'wed', start: '07:00', end: '08:30' },
      ],
      durationMin: 60,
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
      limit: 10,
      exclude: ['2026-07-06T07:00:00.000Z'],
    });
    const starts = slots.map((s) => `${s.scheduledDate} ${s.startTime}`);
    expect(starts).not.toContain('2026-07-06 07:00');
    expect(starts).toContain('2026-07-06 07:30');
    expect(starts).toContain('2026-07-08 07:00');
  });
});

describe('fitsAvailability', () => {
  // 2026-07-06 is a Monday.
  const availability = [{ day: 'mon', start: '06:00', end: '08:00' }];

  it('accepts an off-grid start that fits, returning the end time', () => {
    expect(fitsAvailability('2026-07-06', '07:15', 45, availability)).toBe('08:00');
  });

  it('rejects a start whose duration overflows the window', () => {
    expect(fitsAvailability('2026-07-06', '07:30', 45, availability)).toBeNull();
  });

  it('rejects a day with no matching window', () => {
    expect(fitsAvailability('2026-07-07', '07:00', 45, availability)).toBeNull();
  });

  it('matches wildcard windows', () => {
    expect(
      fitsAvailability('2026-07-07', '07:15', 45, [
        { day: '*', start: '07:00', end: '08:00' },
      ]),
    ).toBe('08:00');
  });
});

describe('parseSlotWish / matchesSlotWish', () => {
  const candidate = (date: string, start: string): SlotCandidate => ({
    scheduledDate: date,
    startTime: start,
    endTime: '08:00',
    scheduledStartUtc: `${date}T${start}:00.000Z`,
  });

  it('parses weekday names', () => {
    const wish = parseSlotWish('can we do Monday instead?');
    expect(wish.days).toEqual(['mon']);
    expect(wish.window).toBeNull();
    expect(hasSlotWish(wish)).toBe(true);
  });

  it('parses time-of-day words', () => {
    const wish = parseSlotWish('something in the evening please');
    expect(wish.days).toEqual([]);
    expect(wish.window).toEqual({ startMin: 16 * 60, endMin: 22 * 60 });
  });

  it('parses explicit clock times into a ±90min window', () => {
    const wish = parseSlotWish('can we do 7pm?');
    expect(wish.window).toEqual({ startMin: 19 * 60 - 90, endMin: 19 * 60 + 90 });
  });

  it('parses HH:mm clock times', () => {
    const wish = parseSlotWish('07:00 works');
    expect(wish.window).toEqual({ startMin: 7 * 60 - 90, endMin: 7 * 60 + 90 });
  });

  it('yields an empty wish for unconstrained text', () => {
    const wish = parseSlotWish('none of these work for me');
    expect(hasSlotWish(wish)).toBe(false);
  });

  it('matches day + window constraints', () => {
    const wish = parseSlotWish('Monday morning instead');
    // 2026-07-06 is a Monday.
    expect(matchesSlotWish(candidate('2026-07-06', '07:00'), wish)).toBe(true);
    expect(matchesSlotWish(candidate('2026-07-06', '18:00'), wish)).toBe(false);
    expect(matchesSlotWish(candidate('2026-07-08', '07:00'), wish)).toBe(false);
  });

  it('empty wish matches anything', () => {
    expect(matchesSlotWish(candidate('2026-07-06', '07:00'), parseSlotWish(''))).toBe(true);
  });

  it('parses "later" / "earlier" as a relative wish', () => {
    expect(parseSlotWish('I want later hours').relative).toBe('later');
    expect(parseSlotWish('anything earlier?').relative).toBe('earlier');
    expect(hasSlotWish(parseSlotWish('later please'))).toBe(true);
  });

  it('resolves a relative wish against the offered start times', () => {
    const later = resolveRelativeWish(parseSlotWish('later please'), ['06:00', '07:00']);
    expect(later.window).toEqual({ startMin: 7 * 60 + 1, endMin: 24 * 60 });
    expect(matchesSlotWish(candidate('2026-07-06', '08:00'), later)).toBe(true);
    expect(matchesSlotWish(candidate('2026-07-06', '06:30'), later)).toBe(false);

    const earlier = resolveRelativeWish(parseSlotWish('earlier'), ['06:00', '07:00']);
    expect(earlier.window).toEqual({ startMin: 0, endMin: 6 * 60 });
  });

  it('an explicit time wins over the relative word', () => {
    const wish = resolveRelativeWish(parseSlotWish('later, like 7pm'), ['06:00']);
    expect(wish.window).toEqual({ startMin: 19 * 60 - 90, endMin: 19 * 60 + 90 });
  });
});
