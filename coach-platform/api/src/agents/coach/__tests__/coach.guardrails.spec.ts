import {
  CommitSkeletonArgs,
  UpsertWeekSessionsArgs,
} from '../coach.contracts';
import {
  LoadProxyInput,
  sessionLoadProxy,
  sessionVolume,
  validateAgainstWeeklyTargets,
  validateSessionStructure,
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
      blocks: [
        {
          kind: 'work',
          label: 'Main',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 8000,
              durationSec: null,
              targetPace: 'conversational',
              targetHrZone: 2,
              note: null,
            },
          ],
        },
      ],
    },
    strength: null,
    ...overrides,
  };
}

/** A coherent 20km easy run (block distance matches totalDistanceKm). */
function bigRun(): UpsertWeekSessionsArgs['sessions'][number] {
  return run({
    running: {
      ...run().running!,
      totalDistanceKm: 20,
      blocks: [
        {
          kind: 'work',
          label: 'Main',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 20000,
              durationSec: null,
              targetPace: 'conversational',
              targetHrZone: 2,
              note: null,
            },
          ],
        },
      ],
    },
  });
}

function strength(
  overrides: Partial<UpsertWeekSessionsArgs['sessions'][number]> = {},
): UpsertWeekSessionsArgs['sessions'][number] {
  return {
    slotKey: 'str-1',
    type: 'strength',
    dayOffset: 1,
    title: 'Lower body',
    estDurationMin: 50,
    intensityLabel: 'moderate',
    coachNotes: 'Progressive overload on the squat.',
    running: null,
    strength: {
      splitFocus: 'legs',
      targetVolumeLoad: 4000,
      exercises: [
        {
          name: 'Back Squat',
          category: 'compound',
          order: 0,
          sets: 4,
          targetRepsMin: 6,
          targetRepsMax: 8,
          targetWeightKg: 80,
          targetPct1rm: null,
          targetRir: 2,
          restSec: 120,
          tempo: null,
          supersetGroup: null,
        },
      ],
    },
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
    const v = validateWeek(week([bigRun()]), {
      priorWeekLoad: 8,
      weekTheme: 'build',
      readiness: 'green',
    });
    expect(v.length).toBe(1);
    expect(v[0]).toContain('exceeds');
  });

  it('does not apply the load cap on a deload week', () => {
    const v = validateWeek(week([bigRun()]), {
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

  it('passes a fully structured strength session', () => {
    const v = validateWeek(week([strength()]), {
      priorWeekLoad: null,
      weekTheme: 'build',
      readiness: 'green',
    });
    expect(v).toEqual([]);
  });
});

describe('coach.guardrails — validateSessionStructure', () => {
  it('flags a running session with no blocks', () => {
    const s = run({ running: { ...run().running!, blocks: [] } });
    expect(
      validateSessionStructure(s).some((m) => m.includes('no running blocks')),
    ).toBe(true);
  });

  it('flags a run step with neither distance nor duration', () => {
    const s = run({
      running: {
        ...run().running!,
        totalDistanceKm: null,
        blocks: [
          {
            kind: 'work',
            label: null,
            repeat: 1,
            steps: [
              {
                type: 'run',
                distanceM: null,
                durationSec: null,
                targetPace: null,
                targetHrZone: null,
                note: null,
              },
            ],
          },
        ],
      },
    });
    expect(
      validateSessionStructure(s).some((m) => m.includes('distance or duration')),
    ).toBe(true);
  });

  it('flags a totalDistanceKm that disagrees with summed steps', () => {
    const s = run({ running: { ...run().running!, totalDistanceKm: 20 } });
    expect(
      validateSessionStructure(s).some((m) => m.includes('disagrees')),
    ).toBe(true);
  });

  it('flags a strength exercise missing a load anchor', () => {
    const s = strength({
      strength: {
        ...strength().strength!,
        exercises: [
          {
            ...strength().strength!.exercises[0],
            targetWeightKg: null,
            targetPct1rm: null,
            targetRir: null,
          },
        ],
      },
    });
    expect(
      validateSessionStructure(s).some((m) => m.includes('load anchor')),
    ).toBe(true);
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

describe('coach.guardrails — validateAgainstWeeklyTargets', () => {
  /** A native LoadProxyInput for a running session of N km. */
  function runKm(km: number): LoadProxyInput {
    return {
      type: 'running',
      intensityLabel: 'easy',
      estDurationMin: 40,
      running: { totalDistanceKm: km },
      strength: null,
    };
  }

  it('reads native km / volume-load for sessionVolume', () => {
    expect(sessionVolume(runKm(8))).toBe(8);
    expect(
      sessionVolume({
        type: 'strength',
        intensityLabel: 'moderate',
        estDurationMin: 50,
        running: null,
        strength: { targetVolumeLoad: 4000 },
      }),
    ).toBe(4000);
  });

  it('passes a session that fits within both count and volume budgets', () => {
    const v = validateAgainstWeeklyTargets(
      runKm(10),
      [runKm(10), runKm(10)],
      { sessionCount: 4, totalVolume: 40 },
    );
    expect(v).toEqual([]);
  });

  it('flags exceeding the locked session count', () => {
    const v = validateAgainstWeeklyTargets(
      runKm(5),
      [runKm(5), runKm(5)], // 3rd session
      { sessionCount: 2, totalVolume: 100 },
    );
    expect(v.some((m) => m.includes('quota'))).toBe(true);
  });

  it('flags exceeding the locked volume budget', () => {
    const v = validateAgainstWeeklyTargets(
      runKm(20),
      [runKm(20)], // 40 total
      { sessionCount: 5, totalVolume: 30 },
    );
    expect(v.some((m) => m.includes('budget'))).toBe(true);
  });

  it('allows hitting the budget exactly (epsilon tolerance)', () => {
    const v = validateAgainstWeeklyTargets(runKm(15), [runKm(15)], {
      sessionCount: 2,
      totalVolume: 30,
    });
    expect(v).toEqual([]);
  });
});
