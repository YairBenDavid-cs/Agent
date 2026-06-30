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
  const telemetry = { emitConversationOpened: jest.fn() };
  const listener = new OutcomeClarifyListener(
    commandBus as never,
    telemetry as never,
  );
  return { listener, commandBus, telemetry };
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

  it('pushes a conversation-opened SSE beat for the live chat UI', async () => {
    const { listener, telemetry } = setup();

    await listener.handle(event());

    expect(telemetry.emitConversationOpened).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        conversationId: 'conv-1',
        origin: 'system',
        attention: true,
      }),
    );
    const arg = telemetry.emitConversationOpened.mock.calls[0][0];
    expect(arg.title).toBeTruthy();
  });

  it('does not emit the SSE beat when conversation creation fails', async () => {
    const { listener, telemetry, commandBus } = setup();
    commandBus.execute.mockRejectedValueOnce(new Error('db down'));

    await listener.handle(event());

    expect(telemetry.emitConversationOpened).not.toHaveBeenCalled();
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
