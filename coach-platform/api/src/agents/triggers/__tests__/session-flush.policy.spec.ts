import {
  FlushSignalLike,
  dedupeFlushSignals,
  flushSignalKey,
} from '../session-flush.policy';

describe('session-flush.policy', () => {
  describe('flushSignalKey', () => {
    it('builds a stable identity from tag type + value + target', () => {
      const signal: FlushSignalLike = {
        tag: { type: 'disliked_exercise', value: 'burpees' },
        target: { exerciseId: 'ex-1', plannedSessionId: null, runType: null },
      };
      expect(flushSignalKey(signal)).toBe('disliked_exercise|burpees||ex-1|');
    });

    it('treats a missing target and missing value as empty segments', () => {
      const signal: FlushSignalLike = {
        tag: { type: 'no_motivation' },
      };
      expect(flushSignalKey(signal)).toBe('no_motivation||||');
    });

    it('is independent of confidence/durability — same identity, same key', () => {
      const a: FlushSignalLike = {
        tag: { type: 'disliked_time', value: 'early' },
        target: { runType: 'tempo' },
      };
      const b: FlushSignalLike = {
        tag: { type: 'disliked_time', value: 'early' },
        target: { runType: 'tempo', exerciseId: null },
      };
      expect(flushSignalKey(a)).toBe(flushSignalKey(b));
    });

    it('distinguishes signals that differ only by value', () => {
      const a: FlushSignalLike = { tag: { type: 'disliked_exercise', value: 'burpees' } };
      const b: FlushSignalLike = { tag: { type: 'disliked_exercise', value: 'lunges' } };
      expect(flushSignalKey(a)).not.toBe(flushSignalKey(b));
    });
  });

  describe('dedupeFlushSignals', () => {
    it('drops signals already captured this session', () => {
      const already = [flushSignalKey({ tag: { type: 'disliked_exercise', value: 'burpees' } })];
      const extracted: FlushSignalLike[] = [
        { tag: { type: 'disliked_exercise', value: 'burpees' } },
        { tag: { type: 'no_motivation' } },
      ];
      const out = dedupeFlushSignals(extracted, already);
      expect(out).toHaveLength(1);
      expect(out[0].tag.type).toBe('no_motivation');
    });

    it('drops intra-batch duplicates, first occurrence wins', () => {
      const extracted: FlushSignalLike[] = [
        { tag: { type: 'disliked_exercise', value: 'burpees' }, target: { exerciseId: 'ex-1' } },
        { tag: { type: 'disliked_exercise', value: 'burpees' }, target: { exerciseId: 'ex-1' } },
      ];
      const out = dedupeFlushSignals(extracted, []);
      expect(out).toHaveLength(1);
    });

    it('keeps all distinct signals when nothing was captured before', () => {
      const extracted: FlushSignalLike[] = [
        { tag: { type: 'disliked_exercise', value: 'burpees' } },
        { tag: { type: 'disliked_time', value: 'early' } },
      ];
      expect(dedupeFlushSignals(extracted, [])).toHaveLength(2);
    });

    it('returns an empty array when every signal was already captured', () => {
      const extracted: FlushSignalLike[] = [
        { tag: { type: 'no_motivation' } },
      ];
      const already = extracted.map(flushSignalKey);
      expect(dedupeFlushSignals(extracted, already)).toHaveLength(0);
    });
  });
});
