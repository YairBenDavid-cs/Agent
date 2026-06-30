// Standalone mock data so the ProgramPage renders fully in MOCK_API mode
// (the default). Two programs are modelled — running and strength — selectable
// with VITE_MOCK_DISCIPLINE ('running' | 'strength', default 'running') so the
// card rendering can be eyeballed for both disciplines without a backend.
//
// Each program runs mid-flight: week 1 is the current, committed week (some
// trains finished, some ahead); week 2 is a tentative preview the generator may
// still revise — and it carries a pending approval batch so the review/revise
// surface is exercised too.

import type { Program, PlannedSession, RunningPlan, StrengthPlan } from '../domain/types';
import type { ApprovalBatchView, ApprovalCard, PendingCardBatch } from './approvalsApi';

const TZ = 'Europe/Berlin';

const MOCK_DISCIPLINE: 'running' | 'strength' =
  import.meta.env.VITE_MOCK_DISCIPLINE === 'strength' ? 'strength' : 'running';

/* ── Programs ───────────────────────────────────────────────────────────── */

function makeProgram(over: Partial<Program> & Pick<Program, 'id' | 'discipline' | 'goalSnapshot'>): Program {
  return {
    startDate: '2026-06-15',
    horizonDate: '2026-08-23',
    status: 'active',
    currentWeekIndex: 1,
    weeks: [
      {
        weekIndex: 0,
        startDate: '2026-06-15',
        endDate: '2026-06-21',
        theme: 'base',
        plannedLoadTarget: 28,
        planState: 'committed',
        status: 'done',
        generatedAt: '2026-06-14T18:00:00.000Z',
      },
      {
        weekIndex: 1,
        startDate: '2026-06-22',
        endDate: '2026-06-28',
        theme: 'base',
        plannedLoadTarget: 32,
        planState: 'committed',
        status: 'current',
        generatedAt: '2026-06-21T18:00:00.000Z',
      },
      {
        weekIndex: 2,
        startDate: '2026-06-29',
        endDate: '2026-07-05',
        theme: 'build',
        plannedLoadTarget: 36,
        planState: 'tentative',
        status: 'upcoming',
        generatedAt: '2026-06-21T18:00:00.000Z',
      },
    ],
    ...over,
  };
}

const RUNNING_PROGRAM = makeProgram({
  id: 'prog_run_1',
  discipline: 'running',
  goalSnapshot: {
    primaryGoal: 'Run a sub-50:00 10K',
    note: 'First serious race in two years — build steadily, stay injury-free.',
    horizon: '2026-08-23',
  },
});

const STRENGTH_PROGRAM = makeProgram({
  id: 'prog_str_1',
  discipline: 'strength',
  goalSnapshot: {
    primaryGoal: 'Add 20 kg to your squat',
    note: 'Linear strength block, leaving a rep in reserve on the main lifts.',
    horizon: '2026-08-23',
  },
});

/* ── Session builders ───────────────────────────────────────────────────── */

function base(
  programId: string,
  partial: Partial<PlannedSession> & Pick<PlannedSession, 'id' | 'scheduledDate' | 'type'>,
): PlannedSession {
  return {
    programId,
    weekIndex: 1,
    startTime: '07:00',
    endTime: '08:00',
    timezone: TZ,
    scheduledStartUtc: `${partial.scheduledDate}T05:00:00.000Z`,
    planState: 'committed',
    title: 'Train',
    estDurationMin: 60,
    intensityLabel: 'moderate',
    coachNotes: null,
    running: null,
    strength: null,
    outcome: {
      status: 'planned',
      reasonCode: null,
      perceivedEffort: null,
      enjoyment: null,
      matchedActivityId: null,
      feedbackRef: null,
      recordedAt: null,
    },
    ...partial,
  };
}

function easyRun(km: number, pace: string): RunningPlan {
  return {
    runType: 'easy',
    totalDistanceKm: km,
    totalDurationMin: km * 6,
    targetPace: pace,
    targetHrZone: 2,
    targetRpe: 3,
    blocks: [
      {
        kind: 'work',
        label: 'Easy run',
        repeat: 1,
        steps: [
          {
            type: 'run',
            distanceM: km * 1000,
            durationSec: null,
            targetPace: pace,
            targetHrZone: 2,
            note: 'Conversational throughout — keep it relaxed.',
          },
        ],
      },
    ],
  };
}

/* ── Running sessions ───────────────────────────────────────────────────── */

const RUNNING_SESSIONS: PlannedSession[] = [
  // Week 1 (current, committed)
  base('prog_run_1', {
    id: 'rps_1',
    type: 'running',
    scheduledDate: '2026-06-22',
    title: 'Easy aerobic run',
    intensityLabel: 'easy',
    estDurationMin: 45,
    coachNotes: 'Conversational pace. Keep HR in zone 2 — this is recovery mileage.',
    running: easyRun(7, '6:25/km'),
    outcome: {
      status: 'completed',
      reasonCode: null,
      perceivedEffort: 3,
      enjoyment: 4,
      matchedActivityId: 88123,
      feedbackRef: null,
      recordedAt: '2026-06-22T06:10:00.000Z',
    },
  }),
  base('prog_run_1', {
    id: 'rps_2',
    type: 'running',
    scheduledDate: '2026-06-24',
    title: 'Interval session — 6×800m',
    intensityLabel: 'hard',
    estDurationMin: 55,
    coachNotes: 'Hit 10K goal pace on the reps. Full recovery between.',
    running: {
      runType: 'intervals',
      totalDistanceKm: 9,
      totalDurationMin: 55,
      targetPace: null,
      targetHrZone: 4,
      targetRpe: 8,
      blocks: [
        {
          kind: 'warmup',
          label: 'Warm-Up',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 2000,
              durationSec: null,
              targetPace: 'conversational',
              targetHrZone: 2,
              note: 'No faster than 6:30/km.',
            },
          ],
        },
        {
          kind: 'work',
          label: null,
          repeat: 6,
          steps: [
            {
              type: 'run',
              distanceM: 800,
              durationSec: null,
              targetPace: '4:45/km',
              targetHrZone: 4,
              note: 'Hold goal pace and stay smooth.',
            },
            {
              type: 'rest',
              distanceM: null,
              durationSec: 120,
              targetPace: null,
              targetHrZone: null,
              note: 'walking recovery',
            },
          ],
        },
        {
          kind: 'cooldown',
          label: 'Cool-Down',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 1500,
              durationSec: null,
              targetPace: 'easy',
              targetHrZone: 2,
              note: null,
            },
          ],
        },
      ],
    },
    outcome: {
      status: 'partially_completed',
      reasonCode: 'too_hard',
      perceivedEffort: 9,
      enjoyment: 2,
      matchedActivityId: 88341,
      feedbackRef: null,
      recordedAt: '2026-06-24T06:05:00.000Z',
    },
  }),
  base('prog_run_1', {
    id: 'rps_3',
    type: 'running',
    scheduledDate: '2026-06-26',
    title: 'Tempo run',
    intensityLabel: 'moderate',
    estDurationMin: 50,
    coachNotes: 'Comfortably hard middle block. Settle into a rhythm you could hold for an hour.',
    running: {
      runType: 'tempo',
      totalDistanceKm: 8,
      totalDurationMin: 50,
      targetPace: '5:20/km',
      targetHrZone: 3,
      targetRpe: 6,
      blocks: [
        {
          kind: 'warmup',
          label: 'Warm-Up',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 1500,
              durationSec: null,
              targetPace: 'conversational',
              targetHrZone: 2,
              note: null,
            },
          ],
        },
        {
          kind: 'work',
          label: 'Tempo',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 5000,
              durationSec: null,
              targetPace: '5:20/km',
              targetHrZone: 3,
              note: 'Hold it honest and even.',
            },
          ],
        },
        {
          kind: 'cooldown',
          label: 'Cool-Down',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 1500,
              durationSec: null,
              targetPace: 'easy',
              targetHrZone: 2,
              note: 'or slower!',
            },
          ],
        },
      ],
    },
  }),

  // Week 2 (tentative preview — under review)
  base('prog_run_1', {
    id: 'rps_5',
    type: 'running',
    weekIndex: 2,
    scheduledDate: '2026-06-29',
    planState: 'tentative',
    title: 'Easy aerobic run',
    intensityLabel: 'easy',
    estDurationMin: 50,
    coachNotes: 'Recovery from the weekend long run.',
    running: easyRun(8, '6:20/km'),
  }),
  base('prog_run_1', {
    id: 'rps_6',
    type: 'running',
    weekIndex: 2,
    scheduledDate: '2026-07-01',
    planState: 'tentative',
    title: 'Fartlek run',
    intensityLabel: 'moderate',
    estDurationMin: 45,
    coachNotes: 'Varied surges woven into an easy run to sharpen speed while keeping it playful.',
    running: {
      runType: 'fartlek',
      totalDistanceKm: 8,
      totalDurationMin: 45,
      targetPace: null,
      targetHrZone: 4,
      targetRpe: 6,
      blocks: [
        {
          kind: 'warmup',
          label: 'Warm-Up',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 2000,
              durationSec: null,
              targetPace: 'conversational',
              targetHrZone: 2,
              note: 'No faster than 6:30/km.',
            },
          ],
        },
        {
          kind: 'work',
          label: null,
          repeat: 6,
          steps: [
            {
              type: 'run',
              distanceM: null,
              durationSec: 60,
              targetPace: null,
              targetHrZone: 5,
              note: 'hard surge',
            },
            {
              type: 'rest',
              distanceM: null,
              durationSec: 90,
              targetPace: null,
              targetHrZone: null,
              note: 'easy float',
            },
          ],
        },
        {
          kind: 'cooldown',
          label: 'Cool-Down',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 1000,
              durationSec: null,
              targetPace: 'easy',
              targetHrZone: 2,
              note: 'Shake it out.',
            },
          ],
        },
      ],
    },
  }),
  base('prog_run_1', {
    id: 'rps_7',
    type: 'running',
    weekIndex: 2,
    scheduledDate: '2026-07-03',
    planState: 'tentative',
    title: 'Long run',
    intensityLabel: 'easy',
    estDurationMin: 90,
    startTime: '08:30',
    endTime: '10:00',
    scheduledStartUtc: '2026-07-03T06:30:00.000Z',
    coachNotes: 'Time on feet to build aerobic endurance. Keep it easy — recovery is the point.',
    running: {
      runType: 'long',
      totalDistanceKm: 16,
      totalDurationMin: 90,
      targetPace: '6:15/km',
      targetHrZone: 2,
      targetRpe: 4,
      blocks: [
        {
          kind: 'warmup',
          label: 'Warm-Up',
          repeat: 1,
          steps: [
            { type: 'run', distanceM: 1000, durationSec: null, targetPace: 'easy build', targetHrZone: 2, note: null },
          ],
        },
        {
          kind: 'work',
          label: 'Main',
          repeat: 1,
          steps: [
            {
              type: 'run',
              distanceM: 14000,
              durationSec: null,
              targetPace: '6:15/km',
              targetHrZone: 2,
              note: 'Steady, conversational throughout.',
            },
          ],
        },
        {
          kind: 'cooldown',
          label: 'Cool-Down',
          repeat: 1,
          steps: [
            { type: 'rest', distanceM: null, durationSec: 300, targetPace: null, targetHrZone: null, note: 'walking' },
          ],
        },
      ],
    },
  }),
];

/* ── Strength sessions ──────────────────────────────────────────────────── */

function lower(): StrengthPlan {
  return {
    splitFocus: 'legs',
    targetVolumeLoad: 8200,
    exercises: [
      {
        name: 'Back squat',
        category: 'quads',
        order: 1,
        sets: 4,
        targetRepsMin: 5,
        targetRepsMax: 5,
        targetWeightKg: null,
        targetPct1rm: 80,
        targetRir: 1,
        restSec: 180,
        tempo: '3-1-1-0',
        supersetGroup: null,
      },
      {
        name: 'Romanian deadlift',
        category: 'hamstrings',
        order: 2,
        sets: 3,
        targetRepsMin: 8,
        targetRepsMax: 8,
        targetWeightKg: 70,
        targetPct1rm: null,
        targetRir: 2,
        restSec: 150,
        tempo: null,
        supersetGroup: null,
      },
      {
        name: 'Walking lunge',
        category: 'quads',
        order: 3,
        sets: 3,
        targetRepsMin: 10,
        targetRepsMax: 10,
        targetWeightKg: 20,
        targetPct1rm: null,
        targetRir: 2,
        restSec: 90,
        tempo: null,
        supersetGroup: 'A',
      },
      {
        name: 'Seated leg curl',
        category: 'hamstrings',
        order: 4,
        sets: 3,
        targetRepsMin: 12,
        targetRepsMax: 12,
        targetWeightKg: null,
        targetPct1rm: null,
        targetRir: 1,
        restSec: 90,
        tempo: null,
        supersetGroup: 'A',
      },
      {
        name: 'Front plank',
        category: 'core',
        order: 5,
        sets: 3,
        targetRepsMin: 45,
        targetRepsMax: 45,
        targetWeightKg: null,
        targetPct1rm: null,
        targetRir: null,
        restSec: 60,
        tempo: null,
        supersetGroup: null,
      },
    ],
  };
}

function upper(): StrengthPlan {
  return {
    splitFocus: 'upper',
    targetVolumeLoad: 6400,
    exercises: [
      {
        name: 'Bench press',
        category: 'chest',
        order: 1,
        sets: 4,
        targetRepsMin: 6,
        targetRepsMax: 6,
        targetWeightKg: null,
        targetPct1rm: 77.5,
        targetRir: 1,
        restSec: 180,
        tempo: '3-1-1-0',
        supersetGroup: null,
      },
      {
        name: 'Pull-up',
        category: 'back',
        order: 2,
        sets: 4,
        targetRepsMin: 8,
        targetRepsMax: 8,
        targetWeightKg: null,
        targetPct1rm: null,
        targetRir: 2,
        restSec: 120,
        tempo: null,
        supersetGroup: null,
      },
      {
        name: 'DB shoulder press',
        category: 'shoulders',
        order: 3,
        sets: 3,
        targetRepsMin: 10,
        targetRepsMax: 10,
        targetWeightKg: 18,
        targetPct1rm: null,
        targetRir: 2,
        restSec: 90,
        tempo: null,
        supersetGroup: 'B',
      },
      {
        name: 'Lateral raise',
        category: 'shoulders',
        order: 4,
        sets: 3,
        targetRepsMin: 15,
        targetRepsMax: 15,
        targetWeightKg: 8,
        targetPct1rm: null,
        targetRir: 1,
        restSec: 60,
        tempo: null,
        supersetGroup: 'B',
      },
    ],
  };
}

const STRENGTH_SESSIONS: PlannedSession[] = [
  // Week 1 (current, committed)
  base('prog_str_1', {
    id: 'sps_1',
    type: 'strength',
    scheduledDate: '2026-06-22',
    startTime: '18:00',
    endTime: '19:15',
    scheduledStartUtc: '2026-06-22T16:00:00.000Z',
    title: 'Lower Body',
    intensityLabel: 'hard',
    estDurationMin: 75,
    coachNotes: 'Heavy bilateral strength then a unilateral superset. Leave a rep in reserve.',
    strength: lower(),
    outcome: {
      status: 'completed',
      reasonCode: null,
      perceivedEffort: 8,
      enjoyment: 4,
      matchedActivityId: 90011,
      feedbackRef: null,
      recordedAt: '2026-06-22T17:30:00.000Z',
    },
  }),
  base('prog_str_1', {
    id: 'sps_2',
    type: 'strength',
    scheduledDate: '2026-06-25',
    startTime: '18:00',
    endTime: '19:10',
    scheduledStartUtc: '2026-06-25T16:00:00.000Z',
    title: 'Upper Body',
    intensityLabel: 'moderate',
    estDurationMin: 70,
    coachNotes: 'Horizontal and vertical pressing and pulling, finished with a shoulder superset.',
    strength: upper(),
  }),

  // Week 2 (tentative preview — under review)
  base('prog_str_1', {
    id: 'sps_4',
    type: 'strength',
    weekIndex: 2,
    scheduledDate: '2026-06-29',
    startTime: '18:00',
    endTime: '19:15',
    scheduledStartUtc: '2026-06-29T16:00:00.000Z',
    planState: 'tentative',
    title: 'Lower Body',
    intensityLabel: 'hard',
    estDurationMin: 75,
    coachNotes: 'Same structure, a touch heavier on the main lift. Keep the same RIR.',
    strength: lower(),
  }),
  base('prog_str_1', {
    id: 'sps_5',
    type: 'strength',
    weekIndex: 2,
    scheduledDate: '2026-07-02',
    startTime: '18:00',
    endTime: '19:10',
    scheduledStartUtc: '2026-07-02T16:00:00.000Z',
    planState: 'tentative',
    title: 'Upper Body',
    intensityLabel: 'moderate',
    estDurationMin: 70,
    coachNotes: 'Add a rep to the pressing where it felt easy last week.',
    strength: upper(),
  }),
];

/* ── Selected program / sessions (by VITE_MOCK_DISCIPLINE) ──────────────── */

export const MOCK_PROGRAM: Program =
  MOCK_DISCIPLINE === 'strength' ? STRENGTH_PROGRAM : RUNNING_PROGRAM;

export const MOCK_PLANNED_SESSIONS: PlannedSession[] =
  MOCK_DISCIPLINE === 'strength' ? STRENGTH_SESSIONS : RUNNING_SESSIONS;

/* ── Pending approval batch for week 2 (the review/revise surface) ──────── */

const reviewSessions = MOCK_PLANNED_SESSIONS.filter((s) => s.weekIndex === 2);

const MOCK_BATCH_ID = 'batch_mock_w2';

export const MOCK_PENDING_BATCHES: PendingCardBatch[] = [
  { id: MOCK_BATCH_ID, programId: MOCK_PROGRAM.id, weekIndex: 2, status: 'pending' },
];

export const MOCK_APPROVAL_BATCH: ApprovalBatchView = {
  batchId: MOCK_BATCH_ID,
  programId: MOCK_PROGRAM.id,
  weekIndex: 2,
  allowedActions: ['approve', 'reject'],
  status: 'pending',
  kind: 'weekly_plan',
  conversationId: null,
  cards: reviewSessions.map(
    (s): ApprovalCard => ({
      sessionId: s.id,
      slotKey: s.id,
      type: s.type,
      title: s.title,
      scheduledDate: s.scheduledDate,
      startTime: s.startTime,
      endTime: s.endTime,
      intensityLabel: s.intensityLabel,
      estDurationMin: s.estDurationMin,
      coachNotes: s.coachNotes,
      placementNote: null,
      diffStatus: 'new',
      changedFields: [],
    }),
  ),
};
