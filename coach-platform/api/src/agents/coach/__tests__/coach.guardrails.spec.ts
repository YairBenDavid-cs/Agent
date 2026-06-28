import {
  CommitSkeletonArgs,
  UpsertWeekSessionsArgs,
} from '../coach.contracts';
import {
  sessionLoadProxy,
  validateSkeleton,
  validateWeek,
  weekLoadProxy,
} from '../coach.guardrails';

function run(
  overrides: Partial<UpsertWeekSessionsArgs['sessions'][number]> = {},
): UpsertWeekSessionsArgs['sessions'][number] {
  return {
    slotKey: 'run-1',
    type: 'running',
    dayOffset: 0,
    title: 'Easy run',
    estDurationMin: 40,
    intensityLabel: 'easy',
    coachNotes: 'Base aerobic volume.',
    running: {
      runType: 'easy',
      totalDistanceKm: 8,
      totalDurationMin: null,
      targetPace: null,
      targetHrZone: 2,
      targetRpe: null,
      segments: [],
    },
    strength: null,
    ...overrides,
  };
}

function week(
  sessions: UpsertWeekSessionsArgs['sessions'],
): UpsertWeekSessionsArgs {
  return {
    programId: 'p1',
    weekIndex: 3,
    weekStartDate: '2026-07-06',
    timezone: 'Europe/Berlin',
    sessions,
  };
}

describe('coach.guardrails — sessionLoadProxy', () => {
  it('scores distance × intensity weight for running', () => {
    expect(sessionLoadProxy(run({ intensityLabel: 'hard' }))).toBe(16); // 8 * 2
  });

  it('falls back to duration when no explicit target', () => {
    const s = run({ running: null, type: 'running', estDurationMin: 60 });
    expect(sessionLoadProxy(s)).toBe(10); // 60/6 * 1 (easy)
  });
});

describe('coach.guardrails — validateWeek', () => {
  it('passes a safe week within the load cap', () => {
    const v = validateWeek(week([run()]), {
      priorWeekLoad: 8,
      weekTheme: 'build',
      readiness: 'green',
    });
    expect(v).toEqual([]);
  });

  it('flags a week that breaches the +10% load cap', () => {
    const v = validateWeek(week([run({ running: { ...run().running!, totalDistanceKm: 20 } })]), {
      priorWeekLoad: 8,
      weekTheme: 'build',
      readiness: 'green',
    });
    expect(v.length).toBe(1);
    expect(v[0]).toContain('exceeds');
  });

  it('does not apply the load cap on a deload week', () => {
    const v = validateWeek(week([run({ running: { ...run().running!, totalDistanceKm: 20 } })]), {
      priorWeekLoad: 8,
      weekTheme: 'deload',
      readiness: 'green',
    });
    expect(v).toEqual([]);
  });

  it('forbids hard sessions when readiness is RED', () => {
    const v = validateWeek(
      week([run({ intensityLabel: 'hard', slotKey: 'h1' })]),
      { priorWeekLoad: null, weekTheme: 'build', readiness: 'red' },
    );
    expect(v.some((m) => m.includes('RED'))).toBe(true);
  });

  it('caps hard sessions to one when readiness is AMBER', () => {
    const v = validateWeek(
      week([
        run({ intensityLabel: 'hard', slotKey: 'h1' }),
        run({ intensityLabel: 'hard', slotKey: 'h2' }),
      ]),
      { priorWeekLoad: null, weekTheme: 'build', readiness: 'amber' },
    );
    expect(v.some((m) => m.includes('AMBER'))).toBe(true);
  });

  it('flags a missing coachNotes', () => {
    const v = validateWeek(week([run({ coachNotes: '  ' })]), {
      priorWeekLoad: null,
      weekTheme: 'build',
      readiness: 'green',
    });
    expect(v.some((m) => m.includes('coachNotes'))).toBe(true);
  });
});

describe('coach.guardrails — validateSkeleton', () => {
  function skeleton(themes: string[]): CommitSkeletonArgs {
    return {
      programId: 'p1',
      currentWeekIndex: 0,
      weeks: themes.map((theme, i) => ({
        weekIndex: i,
        startDate: '2026-07-06',
        endDate: '2026-07-12',
        theme: theme as CommitSkeletonArgs['weeks'][number]['theme'],
        plannedLoadTarget: null,
        planState: i === 0 ? 'committed' : 'tentative',
        status: i === 0 ? 'current' : 'upcoming',
      })),
      rationale: 'Standard build with deloads.',
    };
  }

  it('passes a skeleton with a deload every 4 weeks', () => {
    const v = validateSkeleton(
      skeleton(['base', 'base', 'build', 'deload', 'build', 'build', 'peak', 'deload']),
    );
    expect(v).toEqual([]);
  });

  it('flags more than 4 consecutive non-deload weeks', () => {
    const v = validateSkeleton(
      skeleton(['base', 'base', 'build', 'build', 'build', 'peak']),
    );
    expect(v.some((m) => m.includes('No deload'))).toBe(true);
  });

  it('flags a currentWeekIndex that does not match the current week', () => {
    const s = skeleton(['base', 'build', 'deload', 'build']);
    s.currentWeekIndex = 2;
    const v = validateSkeleton(s);
    expect(v.some((m) => m.includes('currentWeekIndex'))).toBe(true);
  });
});

describe('coach.guardrails — weekLoadProxy', () => {
  it('sums session proxies', () => {
    expect(weekLoadProxy([run(), run({ slotKey: 'run-2' })])).toBe(16);
  });
});
