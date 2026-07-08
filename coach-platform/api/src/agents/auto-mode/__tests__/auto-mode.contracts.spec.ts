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
