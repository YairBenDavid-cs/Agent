import { AutoModeRun } from '../../../domain/auto-mode-run.model';
import { ListAutoModeRunsHandler } from '../list-auto-mode-runs.handler';
import { ListAutoModeRunsQuery } from '../list-auto-mode-runs.query';

describe('ListAutoModeRunsQuery', () => {
  it('defaults limit to 20 when omitted', () => {
    const query = new ListAutoModeRunsQuery('u1');
    expect(query.userId).toBe('u1');
    expect(query.limit).toBe(20);
  });

  it('honors an explicit limit', () => {
    const query = new ListAutoModeRunsQuery('u1', 5);
    expect(query.limit).toBe(5);
  });
});

describe('ListAutoModeRunsHandler', () => {
  it('delegates to runs.findRecent(userId, limit)', async () => {
    const found: AutoModeRun[] = [];
    const runs = { findRecent: jest.fn(() => Promise.resolve(found)) };
    const handler = new ListAutoModeRunsHandler(runs as never);

    const result = await handler.execute(new ListAutoModeRunsQuery('u1', 10));

    expect(runs.findRecent).toHaveBeenCalledWith('u1', 10);
    expect(result).toBe(found);
  });
});
