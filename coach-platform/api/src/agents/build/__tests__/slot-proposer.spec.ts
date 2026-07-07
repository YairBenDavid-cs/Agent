import { proposeSlots } from '../slot-proposer';

describe('slot-proposer', () => {
  // Mon 2026-07-06 .. Sun 2026-07-12. UTC timezone keeps local == UTC so the
  // expected instants are easy to reason about.
  const weekWindow = { from: '2026-07-06', to: '2026-07-12' };

  it('generates one fitting candidate per matching availability window', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [
        { day: 'mon', start: '07:00', end: '09:00' },
        { day: 'wed', start: '18:00', end: '19:30' },
      ],
      durationMin: 60,
      busy: [],
      hardBlocked: [],
      timezone: 'UTC',
      limit: 10,
    });

    expect(slots).toHaveLength(2);
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

  it('drops a candidate inside a HARD blocked window', () => {
    const slots = proposeSlots({
      weekWindow,
      availability: [{ day: 'mon', start: '07:00', end: '09:00' }],
      durationMin: 60,
      busy: [],
      hardBlocked: [{ day: 'mon', start: '06:00', end: '08:00' }],
      timezone: 'UTC',
    });
    expect(slots).toHaveLength(0);
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
});
