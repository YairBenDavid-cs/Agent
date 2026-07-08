import {
  formatSessionBody,
  toCalendarEventInput,
} from '../calendar-event.builder';
import {
  RunningPlan,
  StrengthPlan,
} from '../../../planned-sessions/domain/planned-session.model';

const running: RunningPlan = {
  runType: 'tempo' as RunningPlan['runType'],
  totalDistanceKm: 8,
  totalDurationMin: null,
  targetPace: '4:45/km',
  targetHrZone: null,
  targetRpe: null,
  blocks: [
    {
      kind: 'warmup',
      label: null,
      repeat: 1,
      steps: [
        {
          type: 'run',
          distanceM: null,
          durationSec: 600,
          targetPace: 'conversational',
          targetHrZone: null,
          note: null,
        },
      ],
    },
    {
      kind: 'work',
      label: 'Tempo',
      repeat: 4,
      steps: [
        {
          type: 'run',
          distanceM: 1000,
          durationSec: null,
          targetPace: '4:30/km',
          targetHrZone: null,
          note: 'No faster than 4:20/km',
        },
        {
          type: 'rest',
          distanceM: null,
          durationSec: 90,
          targetPace: null,
          targetHrZone: null,
          note: null,
        },
      ],
    },
  ],
};

const strength: StrengthPlan = {
  splitFocus: 'push',
  targetVolumeLoad: null,
  exercises: [
    {
      name: 'Overhead Press',
      category: 'shoulders',
      order: 2,
      sets: 3,
      targetRepsMin: 8,
      targetRepsMax: 10,
      targetWeightKg: null,
      targetPct1rm: null,
      targetRir: 2,
      restSec: 90,
      tempo: null,
      supersetGroup: null,
    },
    {
      name: 'Bench Press',
      category: 'chest',
      order: 1,
      sets: 4,
      targetRepsMin: 5,
      targetRepsMax: 5,
      targetWeightKg: 80,
      targetPct1rm: null,
      targetRir: null,
      restSec: 120,
      tempo: '3-1-1-0',
      supersetGroup: null,
    },
  ],
};

describe('toCalendarEventInput', () => {
  const base = {
    id: 'sess-1',
    title: 'Tempo run',
    running,
    strength: null,
    scheduledStartUtc: '2026-06-22T05:00:00.000Z',
    estDurationMin: 60,
    timezone: 'Europe/Berlin',
  };

  it('projects the session onto a tagged event with the body as description', () => {
    const input = toCalendarEventInput(base);
    expect(input).toEqual({
      summary: 'Tempo run',
      description: formatSessionBody(base),
      startUtc: '2026-06-22T05:00:00.000Z',
      endUtc: '2026-06-22T06:00:00.000Z',
      timezone: 'Europe/Berlin',
      plannedSessionId: 'sess-1',
    });
  });

  it('omits description when the session has no body', () => {
    const input = toCalendarEventInput({
      ...base,
      running: null,
      strength: null,
    });
    expect(input.description).toBeUndefined();
  });

  it('derives end from start + estDurationMin', () => {
    const input = toCalendarEventInput({ ...base, estDurationMin: 30 });
    expect(input.endUtc).toBe('2026-06-22T05:30:00.000Z');
  });
});

describe('formatSessionBody', () => {
  it('renders a running plan: totals line + blocks with repeats and notes', () => {
    expect(formatSessionBody({ running, strength: null })).toBe(
      [
        '8 km · target 4:45/km',
        'Warmup: 10 min @ conversational',
        'Tempo: 4× (1 km @ 4:30/km (No faster than 4:20/km) + rest 90s)',
      ].join('\n'),
    );
  });

  it('renders a strength plan ordered by exercise order', () => {
    expect(formatSessionBody({ running: null, strength })).toBe(
      [
        'Focus: push',
        '1. Bench Press — 4×5 @ 80 kg, rest 120s, tempo 3-1-1-0',
        '2. Overhead Press — 3×8–10 @ RIR 2, rest 90s',
      ].join('\n'),
    );
  });

  it('returns undefined when both bodies are null', () => {
    expect(formatSessionBody({ running: null, strength: null })).toBeUndefined();
  });
});
