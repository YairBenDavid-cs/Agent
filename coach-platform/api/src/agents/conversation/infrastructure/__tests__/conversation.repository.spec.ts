import { ConversationRepository } from '../conversation.repository';

/**
 * Unit-covers the two small persistence rules added for the dual-mode redesign:
 *  - BE-2: a new conversation's default mode is chosen by origin (user→ask,
 *    system→plan) unless an explicit mode is supplied.
 *  - BE-1: a user reply clears the `attention` flag in the same atomic write.
 * The Mongoose models are mocked; we assert on the documents/updates handed to
 * them rather than on a live DB.
 */
function leanDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'conv-1',
    user_id: 'u1',
    title: null,
    status: 'active',
    mode: 'ask',
    origin: 'user',
    attention: false,
    summary: '',
    summarized_up_to_seq: 0,
    last_seq: 1,
    pending_card_batch_id: null,
    pending_candidates: [],
    closed_at: null,
    createdAt: new Date('2026-06-29T00:00:00.000Z'),
    updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    ...overrides,
  };
}

function makeRepo(opts: { findOneResult?: Record<string, unknown> | null } = {}) {
  const created: Record<string, unknown>[] = [];
  const findOneAndUpdate = jest.fn().mockReturnValue({
    lean: () => ({ exec: () => Promise.resolve(leanDoc()) }),
  });
  const findOne = jest.fn().mockReturnValue({
    sort: () => ({
      lean: () => ({
        exec: () =>
          Promise.resolve(
            opts.findOneResult === undefined ? null : opts.findOneResult,
          ),
      }),
    }),
  });
  const model = {
    create: jest.fn().mockImplementation((doc: Record<string, unknown>) => {
      created.push(doc);
      return Promise.resolve({ toObject: () => leanDoc(doc) });
    }),
    findOneAndUpdate,
    findOne,
  };
  const messages = {
    create: jest.fn().mockResolvedValue({
      toObject: () => ({
        _id: 'm1',
        conversation_id: 'conv-1',
        user_id: 'u1',
        seq: 1,
        role: 'user',
        content: 'hi',
        meta: null,
        createdAt: new Date('2026-06-29T00:00:00.000Z'),
      }),
    }),
  };
  const repo = new ConversationRepository(model as never, messages as never);
  return { repo, model, messages, findOneAndUpdate, findOne, created };
}

describe('ConversationRepository.createConversation — default mode by origin (BE-2)', () => {
  it('defaults a user-opened chat to ask', async () => {
    const { repo, created } = makeRepo();
    await repo.createConversation('u1', null);
    expect(created[0]).toMatchObject({ origin: 'user', mode: 'ask' });
  });

  it('defaults a system-opened chat to plan', async () => {
    const { repo, created } = makeRepo();
    await repo.createConversation('u1', 'Adjust your week', { origin: 'system' });
    expect(created[0]).toMatchObject({ origin: 'system', mode: 'plan' });
  });

  it('honours an explicit mode over the origin default', async () => {
    const { repo, created } = makeRepo();
    await repo.createConversation('u1', null, { origin: 'user', mode: 'plan' });
    expect(created[0]).toMatchObject({ origin: 'user', mode: 'plan' });
  });
});

describe('ConversationRepository.appendMessage — attention clear (BE-1)', () => {
  it('clears attention when the appended message is from the user', async () => {
    const { repo, findOneAndUpdate } = makeRepo();
    await repo.appendMessage('u1', 'conv-1', { role: 'user', content: 'hi' });
    const update = findOneAndUpdate.mock.calls[0][1];
    expect(update).toMatchObject({
      $inc: { last_seq: 1 },
      $set: { attention: false },
    });
  });

  it('does not touch attention for an assistant message', async () => {
    const { repo, findOneAndUpdate } = makeRepo();
    await repo.appendMessage('u1', 'conv-1', {
      role: 'assistant',
      content: 'hello',
    });
    const update = findOneAndUpdate.mock.calls[0][1];
    expect(update).toEqual({ $inc: { last_seq: 1 } });
  });
});

describe('ConversationRepository.findOpenBuildConversation (BW1)', () => {
  it('queries the active program_build chat, newest first, tenant-scoped', async () => {
    const { repo, findOne } = makeRepo({
      findOneResult: leanDoc({ purpose: 'program_build' }),
    });

    const convo = await repo.findOpenBuildConversation('u1');

    expect(findOne).toHaveBeenCalledWith({
      user_id: 'u1',
      purpose: 'program_build',
      status: 'active',
    });
    expect(convo?.purpose).toBe('program_build');
  });

  it('returns null when no build is in flight', async () => {
    const { repo } = makeRepo({ findOneResult: null });
    await expect(repo.findOpenBuildConversation('u1')).resolves.toBeNull();
  });
});
