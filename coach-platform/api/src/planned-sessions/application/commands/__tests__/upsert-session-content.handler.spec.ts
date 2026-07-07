import { PlannedOutcome, SessionDiff } from '../../../domain/planned-session.model';
import { SessionContent } from '../../../domain/planned-session.repository.port';
import { UpsertSessionContentCommand } from '../upsert-session-content.command';
import { UpsertSessionContentHandler } from '../upsert-session-content.handler';

const content: SessionContent = {
  title: 'Tempo run',
  estDurationMin: 60,
  intensityLabel: 'hard',
  coachNotes: null,
  running: {
    runType: 'tempo',
    totalDistanceKm: 15,
    totalDurationMin: null,
    targetPace: null,
    targetHrZone: null,
    targetRpe: null,
    blocks: [],
  },
  strength: null,
};

const diff: SessionDiff = {
  committedAt: '2026-07-07T09:00:00.000Z',
  changes: [{ field: 'totalDistanceKm', before: 10, after: 15 }],
};

function outcome(overrides: Partial<PlannedOutcome> = {}): PlannedOutcome {
  return {
    status: 'planned',
    reasonCode: null,
    perceivedEffort: null,
    enjoyment: null,
    matchedActivityId: null,
    feedbackRef: null,
    recordedAt: null,
    ...overrides,
  };
}

function setup(opts: { found: PlannedOutcome | null }) {
  const repository = {
    findById: jest.fn(() =>
      Promise.resolve(opts.found ? { id: 'ps1', outcome: opts.found } : null),
    ),
    updateContent: jest.fn(() => Promise.resolve()),
  };
  const handler = new UpsertSessionContentHandler(repository as never);
  return { handler, repository };
}

const cmd = new UpsertSessionContentCommand('u1', 'ps1', content, diff);

describe('UpsertSessionContentHandler', () => {
  it('writes content + diff on a still-planned session (tentative or committed)', async () => {
    const { handler, repository } = setup({ found: outcome() });

    const res = await handler.execute(cmd);

    expect(repository.updateContent).toHaveBeenCalledWith(
      'u1',
      'ps1',
      content,
      diff,
    );
    expect(res).toEqual({ updated: true, plannedSessionId: 'ps1' });
  });

  it('throws when the session does not exist', async () => {
    const { handler, repository } = setup({ found: null });

    await expect(handler.execute(cmd)).rejects.toThrow(/not found/i);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('rejects a completed session', async () => {
    const { handler, repository } = setup({
      found: outcome({ status: 'completed' }),
    });

    await expect(handler.execute(cmd)).rejects.toThrow(/already completed/i);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('rejects a skipped session', async () => {
    const { handler, repository } = setup({
      found: outcome({ status: 'skipped' }),
    });

    await expect(handler.execute(cmd)).rejects.toThrow(/already skipped/i);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('rejects a deviated session', async () => {
    const { handler, repository } = setup({
      found: outcome({ status: 'deviated' }),
    });

    await expect(handler.execute(cmd)).rejects.toThrow(/already deviated/i);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('rejects a session already linked to a recorded activity', async () => {
    const { handler, repository } = setup({
      found: outcome({ matchedActivityId: 42 }),
    });

    await expect(handler.execute(cmd)).rejects.toThrow(/linked to a recorded activity/i);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });
});
