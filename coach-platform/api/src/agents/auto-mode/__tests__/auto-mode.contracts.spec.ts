import { autoModeIntentSchema } from '../auto-mode.contracts';

describe('autoModeIntentSchema', () => {
  it('accepts a finalized intent with scenario + reason and no clarifyingQuestion', () => {
    const result = autoModeIntentSchema.safeParse({
      scenario: 'new_week',
      reason: 'Start of a new training block.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a pending clarifyingQuestion with scenario/reason left null', () => {
    const result = autoModeIntentSchema.safeParse({
      scenario: null,
      reason: null,
      clarifyingQuestion: 'Should this apply just this week, or going forward?',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a scenario finalized alongside a clarifyingQuestion', () => {
    const result = autoModeIntentSchema.safeParse({
      scenario: 'new_week',
      reason: 'Start of a new training block.',
      clarifyingQuestion: 'Are you sure?',
    });
    expect(result.success).toBe(false);
  });

  it('rejects neither a finalized scenario nor a clarifyingQuestion', () => {
    const result = autoModeIntentSchema.safeParse({
      scenario: null,
      reason: null,
      clarifyingQuestion: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a scenario finalized without a reason', () => {
    const result = autoModeIntentSchema.safeParse({
      scenario: 'new_week',
      reason: null,
    });
    expect(result.success).toBe(false);
  });

  describe('scenario completeness (finalized intents must carry what the edit needs)', () => {
    it('rejects a finalized session_edit without a plannedSessionId', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'session_edit',
        requestedChangeDescription: 'make it shorter',
        reason: 'athlete is tired',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('plannedSessionId'))).toBe(true);
      }
    });

    it('rejects a finalized session_edit without a requestedChangeDescription', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'session_edit',
        plannedSessionId: 'sess-1',
        reason: 'athlete is tired',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('requestedChangeDescription')),
        ).toBe(true);
      }
    });

    it('accepts a finalized session_edit with both id and change description', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'session_edit',
        plannedSessionId: 'sess-1',
        requestedChangeDescription: 'make it shorter',
        reason: 'athlete is tired',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a finalized session_time_edit without a plannedSessionId', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'session_time_edit',
        requestedDate: '2026-07-10',
        requestedStartTime: '07:00',
        reason: 'meeting conflict',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('plannedSessionId'))).toBe(true);
      }
    });

    it('rejects a finalized session_time_edit with neither a requestedDate nor a requestedStartTime', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'session_time_edit',
        plannedSessionId: 'sess-1',
        reason: 'meeting conflict',
      });
      expect(result.success).toBe(false);
    });

    it('accepts a finalized session_time_edit with an id and a time', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'session_time_edit',
        plannedSessionId: 'sess-1',
        requestedStartTime: '07:00',
        reason: 'meeting conflict',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a finalized weekly_targets_edit with no target field at all', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'weekly_targets_edit',
        reason: 'cut back a little',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.includes('sessionCount, totalVolume, or keyGoals'),
          ),
        ).toBe(true);
      }
    });

    it('accepts a finalized weekly_targets_edit with a single target field', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: 'weekly_targets_edit',
        totalVolume: 30,
        reason: 'cut back a little',
      });
      expect(result.success).toBe(true);
    });

    it('does not apply completeness rules while a clarifyingQuestion is pending', () => {
      const result = autoModeIntentSchema.safeParse({
        scenario: null,
        reason: null,
        clarifyingQuestion: 'Which session do you mean?',
      });
      expect(result.success).toBe(true);
    });
  });

  it('accepts a finalized intent that also carries a standingPreference', () => {
    const result = autoModeIntentSchema.safeParse({
      scenario: 'weekly_targets_edit',
      totalVolume: 30,
      reason: 'cutting back after a hard block',
      standingPreference: {
        tagType: 'volume_too_high',
        value: 30,
        polarity: 'decrease',
        durability: 'standing',
        scope: 'global',
        discipline: 'running',
        affectsCurrentWeek: false,
        rationale: 'Athlete confirmed 30km should be the new standing weekly cap.',
      },
    });
    expect(result.success).toBe(true);
  });
});
