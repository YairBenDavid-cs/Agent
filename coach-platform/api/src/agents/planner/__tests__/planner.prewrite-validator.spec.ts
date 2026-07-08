import {
  PlacementEntry,
  validatePlacement,
} from '../planner.prewrite-validator';

// 2026-07-06 is a Monday (UTC).
function entry(overrides: Partial<PlacementEntry> = {}): PlacementEntry {
  return {
    plannedSessionId: 's1',
    scheduledDate: '2026-07-06',
    startTime: '07:00',
    endTime: '08:00',
    scheduledStartUtc: '2026-07-06T07:00:00.000Z',
    ...overrides,
  };
}

describe('planner.prewrite-validator', () => {
  it('passes a clean placement', () => {
    const v = validatePlacement({ placed: [entry()], busy: [], hardBlocked: [] });
    expect(v).toEqual([]);
  });

  it('flags endTime not after startTime', () => {
    const v = validatePlacement({
      placed: [entry({ startTime: '08:00', endTime: '07:30' })],
      busy: [],
      hardBlocked: [],
    });
    expect(v.some((m) => m.includes('not after'))).toBe(true);
  });

  it('flags an unparseable scheduledStartUtc', () => {
    const v = validatePlacement({
      placed: [entry({ scheduledStartUtc: 'not-a-date' })],
      busy: [],
      hardBlocked: [],
    });
    expect(v.some((m) => m.includes('not a valid instant'))).toBe(true);
  });

  it('flags a HARD blocked-window violation on the matching weekday', () => {
    const v = validatePlacement({
      placed: [entry({ startTime: '07:00', endTime: '08:00' })],
      busy: [],
      hardBlocked: [{ day: 'mon', start: '07:30', end: '09:00' }],
    });
    expect(v.some((m) => m.includes('HARD blocked window'))).toBe(true);
  });

  it('ignores a HARD window on a different weekday', () => {
    const v = validatePlacement({
      placed: [entry()],
      busy: [],
      hardBlocked: [{ day: 'tue', start: '07:00', end: '09:00' }],
    });
    expect(v).toEqual([]);
  });

  it('honours a wildcard-day HARD window', () => {
    const v = validatePlacement({
      placed: [entry()],
      busy: [],
      hardBlocked: [{ day: '*', start: '06:00', end: '10:00' }],
    });
    expect(v.some((m) => m.includes('HARD blocked window'))).toBe(true);
  });

  it('flags a clash with a real busy calendar block', () => {
    const v = validatePlacement({
      placed: [entry()],
      busy: [
        { startUtc: '2026-07-06T07:30:00.000Z', endUtc: '2026-07-06T08:30:00.000Z' },
      ],
      hardBlocked: [],
    });
    expect(v.some((m) => m.includes('busy calendar block'))).toBe(true);
  });

  it('flags two placed sessions overlapping each other', () => {
    const v = validatePlacement({
      placed: [
        entry({ plannedSessionId: 'a' }),
        entry({
          plannedSessionId: 'b',
          startTime: '07:30',
          endTime: '08:30',
          scheduledStartUtc: '2026-07-06T07:30:00.000Z',
        }),
      ],
      busy: [],
      hardBlocked: [],
    });
    expect(v.some((m) => m.includes('overlap each other'))).toBe(true);
  });

  it('flags two sessions on the same day even without a time overlap', () => {
    const v = validatePlacement({
      placed: [
        entry({ plannedSessionId: 'a' }),
        entry({
          plannedSessionId: 'b',
          startTime: '18:00',
          endTime: '19:00',
          scheduledStartUtc: '2026-07-06T18:00:00.000Z',
        }),
      ],
      busy: [],
      hardBlocked: [],
    });
    expect(v.some((m) => m.includes('only one session per day'))).toBe(true);
  });

  it('flags starts on adjacent days closer than the minimum recovery gap', () => {
    const v = validatePlacement({
      placed: [
        entry({ plannedSessionId: 'a', startTime: '21:00', endTime: '22:00', scheduledStartUtc: '2026-07-06T21:00:00.000Z' }),
        entry({
          plannedSessionId: 'b',
          scheduledDate: '2026-07-07',
          startTime: '06:00',
          endTime: '07:00',
          scheduledStartUtc: '2026-07-07T06:00:00.000Z',
        }),
      ],
      busy: [],
      hardBlocked: [],
    });
    expect(v.some((m) => m.includes('minimum recovery gap'))).toBe(true);
  });

  it('allows sessions on different days with a sufficient recovery gap', () => {
    const v = validatePlacement({
      placed: [
        entry({ plannedSessionId: 'a' }),
        entry({
          plannedSessionId: 'b',
          scheduledDate: '2026-07-07',
          startTime: '07:00',
          endTime: '08:00',
          scheduledStartUtc: '2026-07-07T07:00:00.000Z',
        }),
      ],
      busy: [],
      hardBlocked: [],
    });
    expect(v).toEqual([]);
  });
});
