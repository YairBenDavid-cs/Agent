import { PreferenceEventRepository } from '../preference-event.repository';

/**
 * Cover the active one-off query surface: active one-offs must exclude consumed
 * events (the lifecycle filter the generation context relies on).
 */
function makeModel() {
  const findQuery = {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const updateExec = jest.fn().mockResolvedValue({ modifiedCount: 3 });
  const model = {
    find: jest.fn().mockReturnValue(findQuery),
    updateMany: jest.fn().mockReturnValue({ exec: updateExec }),
  };
  return { model, findQuery };
}

describe('PreferenceEventRepository queries', () => {
  it('findActiveOneOffs excludes consumed events', async () => {
    const { model } = makeModel();
    const repo = new PreferenceEventRepository(model as never);
    await repo.findActiveOneOffs('u1', null, '2026-06-29T00:00:00.000Z');
    const filter = model.find.mock.calls[0][0];
    expect(filter).toMatchObject({
      user_id: 'u1',
      durability: 'one_off',
      consumed_at: null,
    });
  });
});
