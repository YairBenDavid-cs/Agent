import { ProgramWeek, WeeklyTargets } from '../../../program/domain/program.model';
import { PlannedSession } from '../../../planned-sessions/domain/planned-session.model';
import { PendingCardBatch } from '../../approval/domain/pending-card-batch.model';
import { BuildSnapshot, isWeekBuildComplete, resolveBuildPhase } from '../build-phase.resolver';

function targets(overrides: Partial<WeeklyTargets> = {}): WeeklyTargets {
  return {
    sessionCount: 3,
    totalVolume: 30,
    keyGoals: ['one quality tempo'],
    lockedAt: null,
    ...overrides,
  };
}

function week(overrides: Partial<ProgramWeek> = {}): ProgramWeek {
  return {
    weekIndex: 0,
    startDate: '2026-07-01',
    endDate: '2026-07-07',
    theme: 'base',
    plannedLoadTarget: null,
    planState: 'tentative',
    status: 'current',
    generatedAt: null,
    weekState: 'open',
    weeklyTargets: null,
    ...overrides,
  };
}

function session(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: 's1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 0,
    slotKey: 'k1',
    type: 'running',
    scheduledDate: '2026-07-02',
    startTime: '07:00',
    endTime: '08:00',
    timezone: 'UTC',
    scheduledStartUtc: '2026-07-02T07:00:00.000Z',
    planState: 'committed',
    title: 'Easy run',
    estDurationMin: 60,
    intensityLabel: 'easy',
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
    calendarSync: null,
    ...overrides,
  };
}

function batch(overrides: Partial<PendingCardBatch> = {}): PendingCardBatch {
  return {
    id: 'b1',
    userId: 'u1',
    programId: 'p1',
    weekIndex: 0,
    kind: 'user_initiated',
    status: 'pending',
    runId: 'r1',
    conversationId: 'c1',
    sessionStartUtc: null,
    reason: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(overrides: Partial<BuildSnapshot> = {}): BuildSnapshot {
  return {
    week: week(),
    sessions: [],
    pendingBatch: null,
    slotProposalOutstanding: false,
    ...overrides,
  };
}

/** A session scheduled onto the calendar (has an event id). */
function scheduled(id: string): PlannedSession {
  return session({ id, calendarSync: { provider: 'google', eventId: `ev-${id}`, syncedAt: null, syncState: 'synced' } });
}

describe('resolveBuildPhase', () => {
  it('PROPOSE_TARGETS when week is open with no targets', () => {
    expect(resolveBuildPhase(snapshot())).toBe('PROPOSE_TARGETS');
  });

  it('AWAIT_TARGETS_CONSENT when open with a tentative targets proposal', () => {
    const s = snapshot({ week: week({ weeklyTargets: targets({ lockedAt: null }) }) });
    expect(resolveBuildPhase(s)).toBe('AWAIT_TARGETS_CONSENT');
  });

  it('DRAFT_SESSION when targets locked and fewer committed sessions than the quota', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 3, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [session({ id: 's1' })],
    });
    expect(resolveBuildPhase(s)).toBe('DRAFT_SESSION');
  });

  it('ignores tentative (un-approved) drafts when counting toward the quota', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 2, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [session({ id: 's1' }), session({ id: 's2', planState: 'tentative' })],
    });
    // Only one committed → still drafting.
    expect(resolveBuildPhase(s)).toBe('DRAFT_SESSION');
  });

  it('AWAIT_SESSION_CONSENT when a pending card batch is outstanding', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 3, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [session({ id: 's1' })],
      pendingBatch: batch({ status: 'pending' }),
    });
    expect(resolveBuildPhase(s)).toBe('AWAIT_SESSION_CONSENT');
  });

  it('a terminal card batch does not gate (treated as no pending batch)', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 3, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [session({ id: 's1' })],
      pendingBatch: batch({ status: 'approved' }),
    });
    expect(resolveBuildPhase(s)).toBe('DRAFT_SESSION');
  });

  it('PROPOSE_SLOTS when all sessions committed but at least one is unscheduled', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 2, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [scheduled('s1'), session({ id: 's2' })],
    });
    expect(resolveBuildPhase(s)).toBe('PROPOSE_SLOTS');
  });

  it('AWAIT_SLOT_CONSENT when a slot proposal is outstanding', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 2, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [scheduled('s1'), session({ id: 's2' })],
      slotProposalOutstanding: true,
    });
    expect(resolveBuildPhase(s)).toBe('AWAIT_SLOT_CONSENT');
  });

  it('COMPLETE when every committed session is scheduled (week not yet locked)', () => {
    const s = snapshot({
      week: week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 2, lockedAt: '2026-07-01T00:00:00.000Z' }) }),
      sessions: [scheduled('s1'), scheduled('s2')],
    });
    expect(resolveBuildPhase(s)).toBe('COMPLETE');
  });

  it('COMPLETE when the week is already locked', () => {
    const s = snapshot({ week: week({ weekState: 'locked', weeklyTargets: targets({ lockedAt: '2026-07-01T00:00:00.000Z' }) }) });
    expect(resolveBuildPhase(s)).toBe('COMPLETE');
  });
});

describe('isWeekBuildComplete', () => {
  it('true when quota met and every committed session is scheduled', () => {
    const w = week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 2, lockedAt: '2026-07-01T00:00:00.000Z' }) });
    expect(isWeekBuildComplete(w, [scheduled('s1'), scheduled('s2')])).toBe(true);
  });

  it('false when fewer committed sessions than the quota', () => {
    const w = week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 3, lockedAt: '2026-07-01T00:00:00.000Z' }) });
    expect(isWeekBuildComplete(w, [scheduled('s1')])).toBe(false);
  });

  it('false when a committed session is not yet scheduled', () => {
    const w = week({ weekState: 'targets_locked', weeklyTargets: targets({ sessionCount: 2, lockedAt: '2026-07-01T00:00:00.000Z' }) });
    expect(isWeekBuildComplete(w, [scheduled('s1'), session({ id: 's2' })])).toBe(false);
  });

  it('false when the week has no weekly targets / sessionCount 0', () => {
    const w = week({ weekState: 'open', weeklyTargets: null });
    expect(isWeekBuildComplete(w, [session({ id: 's1' })])).toBe(false);
  });
});
