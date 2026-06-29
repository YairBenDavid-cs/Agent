import { AppendMessageCommand } from '../../conversation/application/commands/append-message.command';
import { StartConversationCommand } from '../../conversation/application/commands/start-conversation.command';
import { OutcomeClarifyListener } from '../outcome-clarify.listener';
import { OutcomeClarifyNeededEvent } from '../outcome.trigger';

function setup() {
  const commandBus = {
    execute: jest.fn().mockImplementation(async (c: unknown) => {
      if (c instanceof StartConversationCommand) {
        return { conversationId: 'conv-1' };
      }
      return undefined;
    }),
  };
  const listener = new OutcomeClarifyListener(commandBus as never);
  return { listener, commandBus };
}

function event(
  overrides: Partial<OutcomeClarifyNeededEvent['payload']> = {},
): OutcomeClarifyNeededEvent {
  return new OutcomeClarifyNeededEvent({
    userId: 'u1',
    plannedSessionId: 'ps1',
    scheduledDate: '2026-06-29',
    status: 'completed',
    reasonCode: 'too_hard',
    ...overrides,
  });
}

describe('OutcomeClarifyListener', () => {
  it('opens a pinned system Plan conversation (D2/D3) and posts the awaiting question', async () => {
    const { listener, commandBus } = setup();

    await listener.handle(event());

    const start = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof StartConversationCommand) as
      | StartConversationCommand
      | undefined;
    expect(start).toBeDefined();
    expect(start!.opts).toEqual({
      origin: 'system',
      mode: 'plan',
      attention: true,
    });
    expect(start!.title).toBeTruthy();

    const append = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof AppendMessageCommand) as
      | AppendMessageCommand
      | undefined;
    expect(append).toBeDefined();
    expect(append!.conversationId).toBe('conv-1');
    expect(append!.role).toBe('assistant');
    expect(append!.meta).toMatchObject({ awaitingConfirmation: true });
  });

  it('names a missed-session conversation distinctly', async () => {
    const { listener, commandBus } = setup();

    await listener.handle(event({ status: 'missed', reasonCode: null }));

    const start = commandBus.execute.mock.calls
      .map((c) => c[0])
      .find((c) => c instanceof StartConversationCommand) as
      StartConversationCommand;
    expect(start.title).toMatch(/missed/i);
  });

  it('never throws — a delivery failure is isolated from outcome recording', async () => {
    const { listener, commandBus } = setup();
    commandBus.execute.mockRejectedValueOnce(new Error('db down'));

    await expect(listener.handle(event())).resolves.toBeUndefined();
  });
});
