import { SessionDiff } from '../../../domain/planned-session.model';
import { CommitSessionCommand } from '../commit-session.command';
import { CommitSessionHandler } from '../commit-session.handler';

const diff: SessionDiff = {
  committedAt: '2026-06-29T09:00:00.000Z',
  changes: [{ field: 'targetPace', before: '5:00/km', after: '5:15/km' }],
};

function setup(opts: { found: boolean }) {
  const repository = {
    findById: jest.fn(() =>
      Promise.resolve(opts.found ? { id: 'ps1' } : null),
    ),
    commitSession: jest.fn(() => Promise.resolve()),
  };
  const handler = new CommitSessionHandler(repository as never);
  return { handler, repository };
}

const cmd = new CommitSessionCommand('u1', 'ps1', diff);

describe('CommitSessionHandler', () => {
  it('flips the session and persists its display diff', async () => {
    const { handler, repository } = setup({ found: true });

    const res = await handler.execute(cmd);

    expect(repository.commitSession).toHaveBeenCalledWith('u1', 'ps1', diff);
    expect(res).toEqual({ committed: true, plannedSessionId: 'ps1' });
  });

  it('throws when the session does not exist (no write)', async () => {
    const { handler, repository } = setup({ found: false });

    await expect(handler.execute(cmd)).rejects.toThrow(/not found/i);
    expect(repository.commitSession).not.toHaveBeenCalled();
  });
});
