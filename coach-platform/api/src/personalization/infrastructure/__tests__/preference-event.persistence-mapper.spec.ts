import {
  CURRENT_TAXONOMY_VERSION,
  PreferenceEventSource,
} from '../../domain/preference-event.model';
import { normalizeLegacySource } from '../preference-event.persistence-mapper';

// Drift guard: the live source union is the source of truth. Legacy values
// (`revision`, `assistant`) are no longer union members — they only survive as
// persisted rows the schema must still accept and the mapper folds into `chat`.
const ALL_SOURCES: Record<PreferenceEventSource, true> = {
  chat: true,
  outcome: true,
  session_flush: true,
};

describe('preference-event source taxonomy (v4)', () => {
  it('pins the taxonomy version at 4 (chat source introduced)', () => {
    expect(CURRENT_TAXONOMY_VERSION).toBe(4);
  });

  it('lists every live source the domain accepts', () => {
    // Guards against adding a union member silently.
    expect(Object.keys(ALL_SOURCES).sort()).toEqual(
      ['chat', 'outcome', 'session_flush'].sort(),
    );
  });
});

describe('normalizeLegacySource', () => {
  it('maps legacy `assistant` rows to `chat`', () => {
    expect(normalizeLegacySource('assistant')).toBe('chat');
  });

  it('maps legacy `revision` rows to `chat`', () => {
    expect(normalizeLegacySource('revision')).toBe('chat');
  });

  it('passes live sources through unchanged', () => {
    expect(normalizeLegacySource('chat')).toBe('chat');
    expect(normalizeLegacySource('outcome')).toBe('outcome');
    expect(normalizeLegacySource('session_flush')).toBe('session_flush');
  });
});
