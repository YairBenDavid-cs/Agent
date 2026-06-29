import { ApiError } from '../../../../../common/errors/api-error';
import { ConversationRepositoryPort } from '../../../domain/conversation.repository.port';
import { DeleteConversationCommand } from '../delete-conversation.command';
import { DeleteConversationHandler } from '../delete-conversation.handler';

describe('DeleteConversationHandler', () => {
  function setup(deleted: boolean) {
    const repository = {
      deleteConversation: jest.fn().mockResolvedValue(deleted),
    } as unknown as jest.Mocked<ConversationRepositoryPort>;
    return { repository, handler: new DeleteConversationHandler(repository) };
  }

  it('cascades the delete via the repository', async () => {
    const { repository, handler } = setup(true);
    await handler.execute(new DeleteConversationCommand('u1', 'c1'));
    expect(repository.deleteConversation).toHaveBeenCalledWith('u1', 'c1');
  });

  it('throws not-found when nothing was deleted', async () => {
    const { handler } = setup(false);
    await expect(
      handler.execute(new DeleteConversationCommand('u1', 'missing')),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
