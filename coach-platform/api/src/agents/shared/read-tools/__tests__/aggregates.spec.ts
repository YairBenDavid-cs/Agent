import { PlannedSessionResponse } from '../../../../planned-sessions/application/dto/planned-session.response';
import { RecoveryDayResponse } from '../../../../recovery/application/dto/recovery-day.response';
import { computeAdherence, computeCrossSource } from '../aggregates';

function planned(
  overrides: Partial<PlannedSessionResponse> & {
    status?: string;
    reasonCode?: string | null;
    perceivedEffort?: number | null;
    enjoyment?: number | null;
  } = {},
): PlannedSessionResponse {
  const { status, reasonCode, perceivedEffort, enjoyment, ...rest } = overrides;
  return {
    id: 'ps',
    programId: 'pg',
    weekIndex: 0,
    type: 'running',
    scheduledDate: '2026-06-01',
    startTime: '08:00',
    endTime: '09:00',
    timezone: 'UTC',
    scheduledStartUtc: '2026-06-01T08:00:00.000Z',
    planState: 'committed',
    title: 'Easy run',
    estDurationMin: 60,
    intensityLabel: 'easy',
    coachNotes: null,
    running: null,
    strength: null,
    outcome: {
      status: (status ?? 'planned') as PlannedSessionResponse['outcome']['status'],
      reasonCode: (reasonCode ?? null) as PlannedSessionResponse['outcome']['reasonCode'],
      perceivedEffort: perceivedEffort ?? null,
      enjoyment: enjoyment ?? null,
    },
    calendarSync: null,
    ...rest,
  } as PlannedSessionResponse;
}

describe('computeAdherence', () => {
  it('returns null completion rate when nothing is planned', () => {
    const out = computeAdherence([]);
    expect(out.completionRate).toBeNull();
    expect(out.totalPlanned).toBe(0);
  });

  it('counts statuses, reasons, most-skipped and time-of-day buckets', () => {
    const out = computeAdherence([
      planned({ status: 'completed' }),
      planned({ status: 'completed' }),
      planned({
        status: 'skipped',
        reasonCode: 'too_hard',
        title: 'Intervals',
        startTime: '07:00',
      }),
      planned({
        status: 'skipped',
        reasonCode: 'too_hard',
        title: 'Intervals',
        startTime: '19:00',
      }),
      planned({ status: 'deviated', reasonCode: 'disliked_time', startTime: '13:00' }),
    ]);

    expect(out.totalPlanned).toBe(5);
    expect(out.completed).toBe(2);
    expect(out.skipped).toBe(2);
    expect(out.deviated).toBe(1);
    expect(out.completionRate).toBeCloseTo(0.4);
    expect(out.reasonCounts.too_hard).toBe(2);
    expect(out.reasonCounts.disliked_time).toBe(1);
    expect(out.mostSkipped[0]).toEqual({ key: 'Intervals', count: 2 });
    expect(out.skippedByTimeOfDay).toEqual({
      morning: 1,
      afternoon: 1,
      evening: 1,
    });
  });
});

function recovery(
  date: string,
  readiness: number | null,
  hrv: number | null = null,
): RecoveryDayResponse {
  return {
    date,
    source: 'garmin',
    ingestionStatus: 'ok',
    warnings: [],
    metrics: {
      training_readiness_score: readiness,
      hrv_last_night: hrv,
      acwr_ratio: 1.1,
    },
  } as RecoveryDayResponse;
}

describe('computeCrossSource', () => {
  it('joins planned outcomes with recovery by date', () => {
    const out = computeCrossSource(
      [
        planned({ scheduledDate: '2026-06-01', perceivedEffort: 8 }),
        planned({ scheduledDate: '2026-06-02', perceivedEffort: 5 }),
      ],
      [recovery('2026-06-01', 30, 40), recovery('2026-06-02', 80, 70)],
    );
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      date: '2026-06-01',
      perceivedEffort: 8,
      trainingReadiness: 30,
      hrvLastNight: 40,
    });
    // Median readiness = 80 (upper of two); day 1 (30) is below → low bucket.
    expect(out.avgRpeLowReadiness).toBe(8);
    expect(out.avgRpeHighReadiness).toBe(5);
  });

  it('handles missing recovery rows gracefully', () => {
    const out = computeCrossSource(
      [planned({ scheduledDate: '2026-06-03', perceivedEffort: 6 })],
      [],
    );
    expect(out.rows[0].trainingReadiness).toBeNull();
    expect(out.avgRpeLowReadiness).toBeNull();
  });
});
