import { ApiError } from '../../../../../common/errors/api-error';
import { Conversation } from '../../../domain/conversation.model';
import { ConversationRepositoryPort } from '../../../domain/conversation.repository.port';
import { UpdateConversationTitleCommand } from '../update-title.command';
import { UpdateConversationTitleHandler } from '../update-title.handler';

describe('UpdateConversationTitleHandler', () => {
  function setup(updated: Conversation | null) {
    const repository = {
      updateTitle: jest.fn().mockResolvedValue(updated),
    } as unknown as jest.Mocked<ConversationRepositoryPort>;
    return { repository, handler: new UpdateConversationTitleHandler(repository) };
  }

  it('returns the renamed conversation', async () => {
    const conversation = { id: 'c1', title: 'New name' } as Conversation;
    const { repository, handler } = setup(conversation);
    const result = await handler.execute(
      new UpdateConversationTitleCommand('u1', 'c1', 'New name'),
    );
    expect(repository.updateTitle).toHaveBeenCalledWith('u1', 'c1', 'New name');
    expect(result).toBe(conversation);
  });

  it('throws not-found when the conversation does not exist', async () => {
    const { handler } = setup(null);
    await expect(
      handler.execute(new UpdateConversationTitleCommand('u1', 'missing', 'x')),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
