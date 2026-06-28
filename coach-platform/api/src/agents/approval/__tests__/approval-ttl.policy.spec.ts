import {
  classifyDraftTtl,
  USER_DRAFT_TTL_MS,
} from '../approval-ttl.policy';

describe('approval-ttl.policy', () => {
  describe('session-day drafts', () => {
    it('auto-commits once now is at/after session start', () => {
      const state = {
        kind: 'session_day' as const,
        createdAtUtc: '2026-06-28T05:00:00.000Z',
        sessionStartUtc: '2026-06-28T17:00:00.000Z',
      };
      expect(classifyDraftTtl(state, '2026-06-28T17:00:00.000Z')).toBe(
        'auto_commit',
      );
      expect(classifyDraftTtl(state, '2026-06-28T18:30:00.000Z')).toBe(
        'auto_commit',
      );
    });

    it('keeps a session-day draft that is still before session start', () => {
      const state = {
        kind: 'session_day' as const,
        createdAtUtc: '2026-06-28T05:00:00.000Z',
        sessionStartUtc: '2026-06-28T17:00:00.000Z',
      };
      expect(classifyDraftTtl(state, '2026-06-28T12:00:00.000Z')).toBe('keep');
    });

    it('keeps (never force-commits) when no session start is known', () => {
      const state = {
        kind: 'session_day' as const,
        createdAtUtc: '2026-06-28T05:00:00.000Z',
        sessionStartUtc: null,
      };
      expect(classifyDraftTtl(state, '2026-06-30T00:00:00.000Z')).toBe('keep');
    });
  });

  describe('user-initiated drafts', () => {
    const createdAtUtc = '2026-06-26T09:00:00.000Z';
    const state = { kind: 'user_initiated' as const, createdAtUtc };

    it('keeps a draft within the inactivity window', () => {
      const now = new Date(Date.parse(createdAtUtc) + USER_DRAFT_TTL_MS - 1000)
        .toISOString();
      expect(classifyDraftTtl(state, now)).toBe('keep');
    });

    it('expires a draft once the inactivity window elapses', () => {
      const now = new Date(Date.parse(createdAtUtc) + USER_DRAFT_TTL_MS)
        .toISOString();
      expect(classifyDraftTtl(state, now)).toBe('expire');
    });
  });
});
