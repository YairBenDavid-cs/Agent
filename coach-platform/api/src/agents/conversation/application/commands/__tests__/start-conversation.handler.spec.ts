import { Conversation } from '../../../domain/conversation.model';
import { ConversationRepositoryPort } from '../../../domain/conversation.repository.port';
import { StartConversationCommand } from '../start-conversation.command';
import { StartConversationHandler } from '../start-conversation.handler';

describe('StartConversationHandler', () => {
  function setup() {
    const repository = {
      createConversation: jest
        .fn()
        .mockResolvedValue({ id: 'c1' } as Conversation),
    } as unknown as jest.Mocked<ConversationRepositoryPort>;
    return { repository, handler: new StartConversationHandler(repository) };
  }

  it('opens a default user conversation (no opts)', async () => {
    const { repository, handler } = setup();

    const res = await handler.execute(
      new StartConversationCommand('u1', 'Hello'),
    );

    expect(repository.createConversation).toHaveBeenCalledWith('u1', 'Hello', {});
    expect(res).toEqual({ conversationId: 'c1' });
  });

  it('threads system/attention/mode opts through to the repository', async () => {
    const { repository, handler } = setup();

    await handler.execute(
      new StartConversationCommand('u1', 'Adjust your week', {
        origin: 'system',
        mode: 'plan',
        attention: true,
      }),
    );

    expect(repository.createConversation).toHaveBeenCalledWith(
      'u1',
      'Adjust your week',
      { origin: 'system', mode: 'plan', attention: true },
    );
  });
});
