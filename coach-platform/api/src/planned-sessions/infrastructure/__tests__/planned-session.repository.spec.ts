import { PlannedSession } from '../../domain/planned-session.model';
import { PlannedSessionRepository } from '../planned-session.repository';

/**
 * Regression cover for the "revise returns the exact same session" bug: the
 * write must REPLACE a tentative week in place ($set, not $setOnInsert), keep
 * committed / outcome-bearing slots untouched, and drop omitted tentative slots.
 */

function plan(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: null,
    userId: 'u1',
    programId: 'p1',
    weekIndex: 2,
    slotKey: 'w2-d0',
    type: 'running',
    scheduledDate: '2026-06-29',
    startTime: '07:00',
    endTime: '07:45',
    timezone: 'UTC',
    scheduledStartUtc: '2026-06-29T07:00:00.000Z',
    planState: 'tentative',
    title: 'Tempo Run',
    estDurationMin: 45,
    intensityLabel: 'moderate',
    coachNotes: 'why',
    running: null,
    strength: null,
    outcome: {
      status: 'planned',
      reasonCode: null,
      perceivedEffort: null,
      enjoyment: null,
      matchedActivityId: null,
      feedbackRef: null,
      recordedAt: null,
    },
    calendarSync: null,
    ...overrides,
  };
}

/** A Mongoose model test double: chainable find() + bulkWrite + deleteMany. */
function makeModel(protectedSlotKeys: string[] = []) {
  const deleteExec = jest.fn().mockResolvedValue({ deletedCount: 0 });
  const model = {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue(protectedSlotKeys.map((slot_key) => ({ slot_key }))),
    }),
    bulkWrite: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockReturnValue({ exec: deleteExec }),
  };
  return { model, deleteExec };
}

describe('PlannedSessionRepository.replaceTentativeWeek', () => {
  it('overwrites an existing slot in place with $set + upsert (no $setOnInsert)', async () => {
    const { model } = makeModel([]);
    const repo = new PlannedSessionRepository(model as never);

    const written = await repo.replaceTentativeWeek([plan({ slotKey: 'w2-d0' })]);

    expect(written).toBe(1);
    const ops = model.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.update.$set).toBeDefined();
    expect(ops[0].updateOne.update.$setOnInsert).toBeUndefined();
    expect(ops[0].updateOne.filter).toMatchObject({
      program_id: 'p1',
      week_index: 2,
      slot_key: 'w2-d0',
    });
  });

  it('never writes a protected (committed / outcome-bearing) slot', async () => {
    const { model } = makeModel(['w2-d1']); // d1 is protected
    const repo = new PlannedSessionRepository(model as never);

    const written = await repo.replaceTentativeWeek([
      plan({ slotKey: 'w2-d0' }),
      plan({ slotKey: 'w2-d1' }),
    ]);

    expect(written).toBe(1);
    const ops = model.bulkWrite.mock.calls[0][0];
    const slots = ops.map(
      (o: { updateOne: { filter: { slot_key: string } } }) =>
        o.updateOne.filter.slot_key,
    );
    expect(slots).toEqual(['w2-d0']);
  });

  it('drops tentative slots the re-plan omits, but never protected ones', async () => {
    const { model, deleteExec } = makeModel([]);
    const repo = new PlannedSessionRepository(model as never);

    await repo.replaceTentativeWeek([plan({ slotKey: 'w2-d0' })]);

    expect(deleteExec).toHaveBeenCalledTimes(1);
    const filter = model.deleteMany.mock.calls[0][0];
    expect(filter).toMatchObject({
      plan_state: 'tentative',
      'outcome.status': 'planned',
      slot_key: { $nin: ['w2-d0'] },
    });
  });

  it('is a no-op for an empty session list', async () => {
    const { model } = makeModel([]);
    const repo = new PlannedSessionRepository(model as never);
    expect(await repo.replaceTentativeWeek([])).toBe(0);
    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(model.deleteMany).not.toHaveBeenCalled();
  });
});
