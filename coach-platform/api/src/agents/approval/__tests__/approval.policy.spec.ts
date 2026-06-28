import {
  allowedApprovalActions,
  isActionAllowed,
  rejectionReason,
} from '../approval.policy';

describe('approval.policy', () => {
  it('offers only approve + revise on the first generation (no fallback)', () => {
    expect(allowedApprovalActions({ hasCommittedFallback: false })).toEqual([
      'approve',
      'revise',
    ]);
  });

  it('adds reject once a committed fallback exists', () => {
    expect(allowedApprovalActions({ hasCommittedFallback: true })).toEqual([
      'approve',
      'revise',
      'reject',
    ]);
  });

  it('forbids reject without a fallback and explains why', () => {
    const ctx = { hasCommittedFallback: false };
    expect(isActionAllowed('reject', ctx)).toBe(false);
    expect(rejectionReason('reject', ctx)).toMatch(/no committed plan/i);
  });

  it('allows reject with a fallback', () => {
    const ctx = { hasCommittedFallback: true };
    expect(isActionAllowed('reject', ctx)).toBe(true);
    expect(rejectionReason('reject', ctx)).toBeNull();
  });

  it('always allows approve and revise regardless of fallback', () => {
    for (const has of [true, false]) {
      const ctx = { hasCommittedFallback: has };
      expect(rejectionReason('approve', ctx)).toBeNull();
      expect(rejectionReason('revise', ctx)).toBeNull();
    }
  });
});
