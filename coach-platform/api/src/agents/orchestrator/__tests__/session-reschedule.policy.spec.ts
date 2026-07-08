import {
  resolveSessionReschedule,
  RescheduleNeighbor,
  RescheduleTarget,
} from '../session-reschedule.policy';

const target = (overrides: Partial<RescheduleTarget> = {}): RescheduleTarget => ({
  plannedSessionId: 'ps1',
  newDate: '2026-07-09',
  newStartTime: '07:00',
  timezone: 'UTC',
  estDurationMin: 60,
  ...overrides,
});

const neighbor = (
  overrides: Partial<RescheduleNeighbor> = {},
): RescheduleNeighbor => ({
  id: 'ps2',
  title: 'Tempo run',
  scheduledDate: '2026-07-07',
  scheduledStartUtc: '2026-07-07T07:00:00.000Z',
  ...overrides,
});

describe('resolveSessionReschedule', () => {
  it('computes the full schedule (endTime + UTC instant) for a clean move', () => {
    const { schedule, violations } = resolveSessionReschedule(target(), [
      neighbor(),
    ]);
    expect(violations).toEqual([]);
    expect(schedule).toEqual({
      scheduledDate: '2026-07-09',
      startTime: '07:00',
      endTime: '08:00',
      timezone: 'UTC',
      scheduledStartUtc: '2026-07-09T07:00:00.000Z',
    });
  });

  it('ignores the session being moved when validating (self is not a neighbor)', () => {
    const { schedule } = resolveSessionReschedule(target(), [
      neighbor({ id: 'ps1', scheduledDate: '2026-07-09' }),
    ]);
    expect(schedule).not.toBeNull();
  });

  it('refuses a move onto a day that already has a session', () => {
    const { schedule, violations } = resolveSessionReschedule(target(), [
      neighbor({ scheduledDate: '2026-07-09' }),
    ]);
    expect(schedule).toBeNull();
    expect(violations[0]).toContain('only one session per day');
  });

  it('refuses a move that leaves less than the minimum recovery gap', () => {
    // New start 2026-07-09T07:00Z, neighbor starts 2026-07-08T22:00Z → 9h gap.
    const { schedule, violations } = resolveSessionReschedule(target(), [
      neighbor({
        scheduledDate: '2026-07-08',
        scheduledStartUtc: '2026-07-08T22:00:00.000Z',
      }),
    ]);
    expect(schedule).toBeNull();
    expect(violations[0]).toContain('minimum recovery gap');
  });

  it('refuses a start time that runs past midnight', () => {
    const { schedule, violations } = resolveSessionReschedule(
      target({ newStartTime: '23:30', estDurationMin: 60 }),
      [],
    );
    expect(schedule).toBeNull();
    expect(violations[0]).toContain('past midnight');
  });

  it('collects multiple violations in one pass', () => {
    const { violations } = resolveSessionReschedule(target(), [
      neighbor({ id: 'ps2', scheduledDate: '2026-07-09' }),
      neighbor({
        id: 'ps3',
        title: 'Long run',
        scheduledDate: '2026-07-08',
        scheduledStartUtc: '2026-07-08T23:00:00.000Z',
      }),
    ]);
    expect(violations).toHaveLength(2);
  });
});
