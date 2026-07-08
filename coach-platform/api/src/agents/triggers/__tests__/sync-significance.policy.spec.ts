import {
  composeSyncReason,
  evaluateSyncSignificance,
  SignificancePlannedSession,
} from '../sync-significance.policy';

const planned = (
  overrides: Partial<SignificancePlannedSession> = {},
): SignificancePlannedSession => ({
  id: 'ps1',
  title: 'Easy run',
  scheduledDate: '2026-07-06',
  type: 'running',
  outcome: { status: 'planned', matchedActivityId: null },
  ...overrides,
});

describe('evaluateSyncSignificance', () => {
  const today = '2026-07-08';

  it('is silent when everything up to today completed as planned', () => {
    const sig = evaluateSyncSignificance({
      today,
      plannedWeek: [
        planned({
          outcome: { status: 'completed', matchedActivityId: 11 },
        }),
        planned({ id: 'ps2', scheduledDate: '2026-07-10' }), // future, untouched
      ],
      observedSessions: [
        { activityId: 11, date: '2026-07-06', type: 'running' },
      ],
    });
    expect(sig.significant).toBe(false);
    expect(composeSyncReason(sig)).toBeNull();
  });

  it('flags a deviated or partially completed session', () => {
    const sig = evaluateSyncSignificance({
      today,
      plannedWeek: [
        planned({
          outcome: { status: 'partially_completed', matchedActivityId: 11 },
        }),
      ],
      observedSessions: [
        { activityId: 11, date: '2026-07-06', type: 'running' },
      ],
    });
    expect(sig.significant).toBe(true);
    expect(sig.reasons[0]).toContain('partially completed');
  });

  it('flags a strictly-past session that is still unmatched (missed)', () => {
    const sig = evaluateSyncSignificance({
      today,
      plannedWeek: [planned({ scheduledDate: '2026-07-07' })],
      observedSessions: [],
    });
    expect(sig.significant).toBe(true);
    expect(sig.reasons[0]).toContain('was missed');
  });

  it('does NOT flag today\'s still-planned session as missed', () => {
    const sig = evaluateSyncSignificance({
      today,
      plannedWeek: [planned({ scheduledDate: today })],
      observedSessions: [],
    });
    expect(sig.significant).toBe(false);
  });

  it('flags an observed activity no planned session claimed (extra load)', () => {
    const sig = evaluateSyncSignificance({
      today,
      plannedWeek: [
        planned({ outcome: { status: 'completed', matchedActivityId: 11 } }),
      ],
      observedSessions: [
        { activityId: 11, date: '2026-07-06', type: 'running' },
        { activityId: 99, date: '2026-07-07', type: 'strength' },
      ],
    });
    expect(sig.significant).toBe(true);
    expect(sig.reasons).toEqual([
      'Unplanned strength activity on 2026-07-07 — extra load on top of the plan.',
    ]);
  });

  it('joins multiple triggers into one composed reason', () => {
    const sig = evaluateSyncSignificance({
      today,
      plannedWeek: [
        planned({
          scheduledDate: '2026-07-06',
          outcome: { status: 'deviated', matchedActivityId: 11 },
        }),
        planned({ id: 'ps2', title: 'Long run', scheduledDate: '2026-07-07' }),
      ],
      observedSessions: [
        { activityId: 11, date: '2026-07-06', type: 'running' },
      ],
    });
    expect(sig.reasons).toHaveLength(2);
    expect(composeSyncReason(sig)).toBe(sig.reasons.join(' '));
  });
});
