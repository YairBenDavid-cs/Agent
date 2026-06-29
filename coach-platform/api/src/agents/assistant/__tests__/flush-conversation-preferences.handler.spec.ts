import { PendingCandidate } from '../../conversation/domain/conversation.model';
import { PreferenceItemDto } from '../../../personalization/application/dto/preference-item.dto';
import { FlushConversationPreferencesCommand } from '../flush-conversation-preferences.command';
import { FlushConversationPreferencesHandler } from '../flush-conversation-preferences.handler';

const TODAY = '2026-06-28';

function candidate(): PendingCandidate {
  return {
    lane: 'black',
    tagType: 'run_type_pref',
    value: -15,
    polarity: 'decrease',
    durability: 'standing',
    scope: 'session',
    discipline: 'running',
    affectsCurrentWeek: true,
    target: null,
    capturedAt: '2026-06-28T10:00:00.000Z',
  };
}

const item: PreferenceItemDto = {
  eventDate: TODAY,
  discipline: 'running',
  scope: 'session',
  durability: 'standing',
  expiresAt: null,
  target: null,
  tag: { type: 'run_type_pref', value: -15, polarity: 'decrease', confidence: 'explicit' },
};

function setup(opts: {
  candidates: PendingCandidate[];
  distilled: PreferenceItemDto[];
}) {
  const conversations = {
    findConversation: jest.fn(() =>
      Promise.resolve({ pendingCandidates: opts.candidates }),
    ),
    clearPendingCandidates: jest.fn(() => Promise.resolve()),
  };
  const distillation = {
    distill: jest.fn(() => Promise.resolve(opts.distilled)),
  };
  const commandBus = {
    execute: jest.fn(() =>
      Promise.resolve({ batchId: 'b1', eventIds: ['e1'], constraintIds: [] }),
    ),
  };
  const handler = new FlushConversationPreferencesHandler(
    conversations as never,
    distillation as never,
    commandBus as never,
  );
  return { handler, conversations, distillation, commandBus };
}

const cmd = new FlushConversationPreferencesCommand(
  'u1',
  'c1',
  'r1',
  'running',
  TODAY,
);

describe('FlushConversationPreferencesHandler', () => {
  it('distils the buffer, writes one chat batch, then clears', async () => {
    const { handler, distillation, commandBus, conversations } = setup({
      candidates: [candidate()],
      distilled: [item],
    });

    const res = await handler.execute(cmd);

    expect(distillation.distill).toHaveBeenCalledTimes(1);
    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(conversations.clearPendingCandidates).toHaveBeenCalledWith('u1', 'c1');
    expect(res.eventIds).toEqual(['e1']);

    // Clear must happen AFTER the durable write so a failure leaves intent staged.
    const clearOrder =
      conversations.clearPendingCandidates.mock.invocationCallOrder[0];
    const writeOrder = commandBus.execute.mock.invocationCallOrder[0];
    expect(clearOrder).toBeGreaterThan(writeOrder);
  });

  it('short-circuits an empty buffer (no distill, no write, no clear)', async () => {
    const { handler, distillation, commandBus, conversations } = setup({
      candidates: [],
      distilled: [],
    });
    const res = await handler.execute(cmd);
    expect(distillation.distill).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(conversations.clearPendingCandidates).not.toHaveBeenCalled();
    expect(res.eventIds).toEqual([]);
  });

  it('clears the buffer but writes nothing when net intent cancels out', async () => {
    const { handler, commandBus, conversations } = setup({
      candidates: [candidate()],
      distilled: [], // everything cancelled
    });
    const res = await handler.execute(cmd);
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(conversations.clearPendingCandidates).toHaveBeenCalledWith('u1', 'c1');
    expect(res.eventIds).toEqual([]);
  });
});
