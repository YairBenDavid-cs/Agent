import {
  CURRENT_TAXONOMY_VERSION,
  PreferenceEvent,
  PreferenceTag,
} from '../../../domain/preference-event.model';
import { PrefEntry } from '../../../domain/pref-entry.model';

let seq = 0;

/**
 * Build a PreferenceEvent for tests with sane defaults. Pass overrides for the
 * fields a given case actually cares about; `tag` is shallow-merged so a case can
 * set just `type`/`value` without restating polarity/confidence.
 */
export function makeEvent(
  overrides: Partial<Omit<PreferenceEvent, 'tag'>> & {
    tag?: Partial<PreferenceTag>;
  } = {},
): PreferenceEvent {
  const { tag: tagOverride, ...rest } = overrides;
  const tag: PreferenceTag = {
    type: 'disliked_exercise',
    value: null,
    polarity: 'avoid',
    confidence: 'inferred',
    ...tagOverride,
  };
  return {
    id: `evt-${++seq}`,
    userId: 'user-1',
    eventDate: '2026-06-01',
    source: 'chat',
    batchId: null,
    discipline: 'strength',
    scope: 'exercise',
    durability: 'standing',
    expiresAt: null,
    target: null,
    tag,
    rawText: '',
    appliedToProjection: true,
    consumedAt: null,
    taxonomyVersion: CURRENT_TAXONOMY_VERSION,
    ...rest,
  };
}

/** Build a PrefEntry for validator tests with sane defaults. */
export function makeEntry<T>(
  value: T,
  overrides: Partial<PrefEntry<T>> = {},
): PrefEntry<T> {
  return {
    value,
    strength: 'soft',
    confidence: 'inferred',
    supportCount: 1,
    sourceEventIds: ['evt-1'],
    firstSeen: '2026-06-01T00:00:00.000Z',
    lastReinforced: '2026-06-01T00:00:00.000Z',
    confirmed: false,
    ...overrides,
  };
}
