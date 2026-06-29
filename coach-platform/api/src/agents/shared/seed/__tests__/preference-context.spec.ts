import { makeEvent } from '../../../../personalization/application/services/__tests__/preference-event.factory';
import {
  buildPreferenceWindows,
  renderPreferenceWindows,
} from '../preference-context';

describe('buildPreferenceWindows', () => {
  it('partitions events by tag confidence into near-term (explicit) and long-term (inferred)', () => {
    const hard = makeEvent({
      id: 'hard-1',
      rawText: 'no burpees this week',
      tag: { type: 'disliked_exercise', value: 'burpees', polarity: 'avoid', confidence: 'explicit' },
    });
    const soft = makeEvent({
      id: 'soft-1',
      rawText: 'tends to skip morning runs',
      tag: { type: 'time_window_blocked', value: 'mon 06:00-09:00', polarity: 'avoid', confidence: 'inferred' },
    });

    const windows = buildPreferenceWindows([hard, soft]);

    expect(windows.nearTerm).toHaveLength(1);
    expect(windows.nearTerm[0]).toMatchObject({
      type: 'disliked_exercise',
      value: 'burpees',
      note: 'no burpees this week',
    });
    expect(windows.longTerm).toHaveLength(1);
    expect(windows.longTerm[0]).toMatchObject({
      type: 'time_window_blocked',
      value: 'mon 06:00-09:00',
    });
  });

  it('dedupes by id and preserves input order within each window', () => {
    const e = makeEvent({
      id: 'dup-1',
      tag: { type: 'volume_bias', value: -0.1, polarity: 'decrease', confidence: 'explicit' },
    });
    const windows = buildPreferenceWindows([e, e]);
    expect(windows.nearTerm).toHaveLength(1);
  });

  it('drops narrative-only `other` events with no value and no note', () => {
    const empty = makeEvent({
      id: 'empty-1',
      rawText: '',
      tag: { type: 'other', value: null, polarity: 'neutral', confidence: 'inferred' },
    });
    const windows = buildPreferenceWindows([empty]);
    expect(windows.nearTerm).toHaveLength(0);
    expect(windows.longTerm).toHaveLength(0);
  });
});

describe('renderPreferenceWindows', () => {
  it('returns null when both windows are empty', () => {
    expect(renderPreferenceWindows({ nearTerm: [], longTerm: [] })).toBeNull();
  });

  it('renders hard preferences as guardrails and soft as long-term bias', () => {
    const hard = makeEvent({
      id: 'hard-1',
      rawText: 'no burpees',
      tag: { type: 'disliked_exercise', value: 'burpees', polarity: 'avoid', confidence: 'explicit' },
    });
    const soft = makeEvent({
      id: 'soft-1',
      rawText: 'prefers tempo runs',
      tag: { type: 'run_type_pref', value: 'tempo', polarity: 'prefer', confidence: 'inferred' },
    });
    const text = renderPreferenceWindows(buildPreferenceWindows([hard, soft]));

    expect(text).toContain('Hard preferences (EXPLICIT');
    expect(text).toContain('Soft preferences (INFERRED');
    expect(text).toContain('[avoid] disliked_exercise burpees');
    expect(text).toContain('"no burpees"');
    expect(text).toContain('[prefer] run_type_pref tempo');
  });

  it('omits the hard section when there are no explicit signals', () => {
    const soft = makeEvent({
      id: 'soft-1',
      tag: { type: 'intensity_bias', value: -0.05, polarity: 'decrease', confidence: 'inferred' },
    });
    const text = renderPreferenceWindows(buildPreferenceWindows([soft]));
    expect(text).not.toContain('Hard preferences');
    expect(text).toContain('Soft preferences');
  });
});
