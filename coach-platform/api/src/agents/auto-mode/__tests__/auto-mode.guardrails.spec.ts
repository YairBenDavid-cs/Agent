import {
  MAX_TARGET_SESSION_COUNT_DELTA,
  MAX_TARGET_VOLUME_SWING,
  MAX_WEEK_OVER_WEEK_VOLUME_INCREASE,
  checkTargetsSwing,
  checkWeekOverWeekVolume,
  conservativeTargets,
  isWorseReadiness,
  totalNativeVolume,
} from '../auto-mode.guardrails';
import { LoadProxyInput } from '../../coach/coach.guardrails';

describe('checkTargetsSwing', () => {
  it('is empty when nothing changed', () => {
    const violations = checkTargetsSwing({
      previous: { sessionCount: 4, totalVolume: 40 },
      proposed: { sessionCount: 4, totalVolume: 40 },
    });
    expect(violations).toEqual([]);
  });

  it('does NOT violate at exactly the session-count delta cap (boundary, not exceeding)', () => {
    const violations = checkTargetsSwing({
      previous: { sessionCount: 4, totalVolume: 40 },
      proposed: {
        sessionCount: 4 + MAX_TARGET_SESSION_COUNT_DELTA,
        totalVolume: 40,
      },
    });
    expect(violations).toEqual([]);
  });

  it('violates just past the session-count delta cap', () => {
    const violations = checkTargetsSwing({
      previous: { sessionCount: 4, totalVolume: 40 },
      proposed: {
        sessionCount: 4 + MAX_TARGET_SESSION_COUNT_DELTA + 1,
        totalVolume: 40,
      },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Session-count change of 3 exceeds/);
  });

  it('does NOT violate at exactly the ±25% volume cap (boundary, not exceeding)', () => {
    const previous = { sessionCount: 4, totalVolume: 40 };
    const proposed = {
      sessionCount: 4,
      totalVolume: previous.totalVolume * (1 + MAX_TARGET_VOLUME_SWING),
    };
    const violations = checkTargetsSwing({ previous, proposed });
    expect(violations).toEqual([]);
  });

  it('violates just past the ±25% volume cap', () => {
    const previous = { sessionCount: 4, totalVolume: 40 };
    const proposed = {
      sessionCount: 4,
      totalVolume: previous.totalVolume * (1 + MAX_TARGET_VOLUME_SWING) + 1,
    };
    const violations = checkTargetsSwing({ previous, proposed });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Volume change of/);
  });

  it('skips the volume check entirely when previous.totalVolume is 0', () => {
    const violations = checkTargetsSwing({
      previous: { sessionCount: 4, totalVolume: 0 },
      proposed: { sessionCount: 4, totalVolume: 1000 },
    });
    expect(violations).toEqual([]);
  });

  it('can report both violations at once', () => {
    const violations = checkTargetsSwing({
      previous: { sessionCount: 4, totalVolume: 40 },
      proposed: { sessionCount: 10, totalVolume: 200 },
    });
    expect(violations).toHaveLength(2);
  });
});

describe('checkWeekOverWeekVolume', () => {
  it('is always empty when isDeload is true, regardless of volume', () => {
    expect(checkWeekOverWeekVolume(40, 1000, true)).toEqual([]);
  });

  it('is always empty when priorWeekVolume is exactly 0', () => {
    expect(checkWeekOverWeekVolume(0, 1000, false)).toEqual([]);
  });

  it('is always empty when priorWeekVolume is negative', () => {
    expect(checkWeekOverWeekVolume(-5, 1000, false)).toEqual([]);
  });

  it('is empty at exactly the +15% ceiling', () => {
    const prior = 40;
    const ceiling = prior * (1 + MAX_WEEK_OVER_WEEK_VOLUME_INCREASE);
    expect(checkWeekOverWeekVolume(prior, ceiling, false)).toEqual([]);
  });

  it('violates just past the +15% ceiling', () => {
    const prior = 40;
    const ceiling = prior * (1 + MAX_WEEK_OVER_WEEK_VOLUME_INCREASE);
    const violations = checkWeekOverWeekVolume(prior, ceiling + 0.1, false);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/exceeds the/);
  });
});

describe('totalNativeVolume', () => {
  it('sums native-unit volume across running and strength sessions, ignoring the fallback', () => {
    const sessions: LoadProxyInput[] = [
      {
        type: 'running',
        intensityLabel: 'easy',
        estDurationMin: 30,
        running: { totalDistanceKm: 10 },
        strength: null,
      },
      {
        type: 'strength',
        intensityLabel: 'hard',
        estDurationMin: 60,
        running: null,
        strength: { targetVolumeLoad: 500 },
      },
      {
        // No explicit target on either side -> contributes 0 (no duration fallback here).
        type: 'running',
        intensityLabel: 'moderate',
        estDurationMin: 45,
        running: { totalDistanceKm: null },
        strength: null,
      },
    ];
    expect(totalNativeVolume(sessions)).toBe(510);
  });

  it('is 0 for an empty list', () => {
    expect(totalNativeVolume([])).toBe(0);
  });
});

describe('isWorseReadiness', () => {
  const bands = ['green', 'amber', 'red'] as const;
  const expected: Record<string, boolean> = {
    'green,green': false,
    'green,amber': false,
    'green,red': false,
    'amber,green': true,
    'amber,amber': false,
    'amber,red': false,
    'red,green': true,
    'red,amber': true,
    'red,red': false,
  };

  for (const candidate of bands) {
    for (const baseline of bands) {
      it(`(${candidate}, ${baseline}) -> ${expected[`${candidate},${baseline}`]}`, () => {
        expect(isWorseReadiness(candidate, baseline)).toBe(
          expected[`${candidate},${baseline}`],
        );
      });
    }
  }
});

describe('conservativeTargets', () => {
  it('averages sessionCount and totalVolume, rounding sessionCount to the nearest integer', () => {
    const result = conservativeTargets(
      { sessionCount: 4, totalVolume: 40 },
      { sessionCount: 5, totalVolume: 50, keyGoals: ['a long run'] },
    );
    expect(result).toEqual({
      sessionCount: 5, // (4+5)/2 = 4.5 -> rounds to 5
      totalVolume: 45,
      keyGoals: ['a long run'],
    });
  });

  it('rounds totalVolume to one decimal place', () => {
    const result = conservativeTargets(
      { sessionCount: 4, totalVolume: 40.15 },
      { sessionCount: 4, totalVolume: 40.28, keyGoals: [] },
    );
    // (40.15 + 40.28) / 2 = 40.215 -> *10 = 402.15 -> round = 402 -> /10 = 40.2
    expect(result.totalVolume).toBe(40.2);
  });

  it('preserves proposed.keyGoals verbatim (never previous.keyGoals)', () => {
    const result = conservativeTargets(
      { sessionCount: 4, totalVolume: 40 },
      { sessionCount: 4, totalVolume: 40, keyGoals: ['x', 'y'] },
    );
    expect(result.keyGoals).toEqual(['x', 'y']);
  });
});
