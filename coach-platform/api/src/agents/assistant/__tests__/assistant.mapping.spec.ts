import { CapturedSignal } from '../assistant.contracts';
import { signalToPendingCandidate, signalToPreferenceItem } from '../assistant.mapping';

const CAPTURED_AT = '2026-06-29T09:00:00.000Z';

function signal(overrides: Partial<CapturedSignal> = {}): CapturedSignal {
  return {
    tagType: 'disliked_exercise',
    value: 'burpees',
    polarity: 'avoid',
    durability: 'standing',
    scope: 'exercise',
    discipline: 'strength',
    affectsCurrentWeek: true,
    rationale: 'Burpees aggravated a knee flare-up last week.',
    ...overrides,
  };
}

describe('signalToPendingCandidate', () => {
  it('carries the lane, capture time, and signal fields into the buffer shape', () => {
    const c = signalToPendingCandidate(signal(), 'black', CAPTURED_AT);

    expect(c).toMatchObject({
      lane: 'black',
      tagType: 'disliked_exercise',
      value: 'burpees',
      polarity: 'avoid',
      durability: 'standing',
      scope: 'exercise',
      discipline: 'strength',
      affectsCurrentWeek: true,
      rationale: 'Burpees aggravated a knee flare-up last week.',
      capturedAt: CAPTURED_AT,
    });
  });

  it('preserves the soft lane for demoted gray signals', () => {
    const c = signalToPendingCandidate(signal(), 'gray', CAPTURED_AT);
    expect(c.lane).toBe('gray');
  });

  it('normalizes a present target and nulls an empty one', () => {
    const withTarget = signalToPendingCandidate(
      signal({ target: { exerciseId: 'ex-9' } }),
      'black',
      CAPTURED_AT,
    );
    expect(withTarget.target).toEqual({
      plannedSessionId: null,
      exerciseId: 'ex-9',
      runType: null,
    });

    const noTarget = signalToPendingCandidate(signal(), 'black', CAPTURED_AT);
    expect(noTarget.target).toBeNull();
  });
});

describe('signalToPreferenceItem', () => {
  it('carries the grounded rationale into the preference item', () => {
    const item = signalToPreferenceItem(signal(), '2026-06-29', 'explicit');
    expect(item.rationale).toBe('Burpees aggravated a knee flare-up last week.');
  });
});
