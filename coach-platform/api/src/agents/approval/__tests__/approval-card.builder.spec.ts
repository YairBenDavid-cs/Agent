import {
  buildApprovalCards,
  CardSessionLike,
} from '../approval-card.builder';

const session = (overrides: Partial<CardSessionLike> = {}): CardSessionLike => ({
  id: 'id-1',
  slotKey: 'mon-run',
  type: 'running',
  title: 'Easy run',
  scheduledDate: '2026-06-22',
  startTime: '07:00',
  endTime: '07:45',
  intensityLabel: 'easy',
  estDurationMin: 45,
  coachNotes: 'base aerobic',
  running: null,
  strength: null,
  ...overrides,
});

describe('buildApprovalCards', () => {
  it('marks every card new on first generation (no baseline)', () => {
    const cards = buildApprovalCards({ draft: [session()] });
    expect(cards).toHaveLength(1);
    expect(cards[0].diffStatus).toBe('new');
    expect(cards[0].changedFields).toEqual([]);
  });

  it('marks an unchanged slot unchanged', () => {
    const draft = [session()];
    const baseline = [session()];
    const cards = buildApprovalCards({ draft, baseline });
    expect(cards[0].diffStatus).toBe('unchanged');
    expect(cards[0].changedFields).toEqual([]);
  });

  it('marks a modified slot and lists the changed fields', () => {
    const baseline = [session()];
    const draft = [
      session({ startTime: '18:00', endTime: '18:45', intensityLabel: 'moderate' }),
    ];
    const cards = buildApprovalCards({ draft, baseline });
    expect(cards[0].diffStatus).toBe('modified');
    expect(cards[0].changedFields).toEqual([
      'startTime',
      'endTime',
      'intensityLabel',
    ]);
  });

  it('appends a removed card for a baseline slot absent from the draft', () => {
    const baseline = [session(), session({ slotKey: 'wed-strength', id: 'id-2' })];
    const draft = [session()];
    const cards = buildApprovalCards({ draft, baseline });
    expect(cards).toHaveLength(2);
    expect(cards[0].diffStatus).toBe('unchanged');
    const removed = cards[1];
    expect(removed.diffStatus).toBe('removed');
    expect(removed.slotKey).toBe('wed-strength');
    expect(removed.sessionId).toBe('id-2');
  });

  it('attaches the Planner placement note by slotKey', () => {
    const cards = buildApprovalCards({
      draft: [session()],
      placementNotes: { 'mon-run': 'after your morning block' },
    });
    expect(cards[0].placementNote).toBe('after your morning block');
  });

  it('preserves draft order and leaves placementNote null when absent', () => {
    const draft = [
      session({ slotKey: 'a', id: 'a' }),
      session({ slotKey: 'b', id: 'b' }),
    ];
    const cards = buildApprovalCards({ draft });
    expect(cards.map((c) => c.slotKey)).toEqual(['a', 'b']);
    expect(cards[0].placementNote).toBeNull();
  });
});
