import { ProgramWeek, WeekState } from '../../../domain/program.model';
import { ProposeWeeklyTargetsCommand } from '../propose-weekly-targets.command';
import { ProposeWeeklyTargetsHandler } from '../propose-weekly-targets.handler';

function week(weekState: WeekState = 'open'): ProgramWeek {
  return {
    weekIndex: 0,
    startDate: '2026-07-01',
    endDate: '2026-07-07',
    theme: 'base',
    plannedLoadTarget: null,
    planState: 'tentative',
    status: 'current',
    generatedAt: null,
    weekState,
    weeklyTargets: null,
  };
}

function setup(opts: { week: ProgramWeek | null }) {
  const repository = {
    findById: jest.fn(() =>
      Promise.resolve(opts.week ? { weeks: [opts.week] } : { weeks: [] }),
    ),
    proposeWeeklyTargets: jest.fn(() => Promise.resolve()),
  };
  const handler = new ProposeWeeklyTargetsHandler(repository as never);
  return { handler, repository };
}

const cmd = new ProposeWeeklyTargetsCommand('u1', 'p1', 0, 3, 30, [
  'one quality tempo',
]);

describe('ProposeWeeklyTargetsHandler', () => {
  it('stages a tentative proposal on an open week (no lockedAt)', async () => {
    const { handler, repository } = setup({ week: week('open') });

    const res = await handler.execute(cmd);

    expect(repository.proposeWeeklyTargets).toHaveBeenCalledWith('u1', 'p1', 0, {
      sessionCount: 3,
      totalVolume: 30,
      keyGoals: ['one quality tempo'],
    });
    expect(res).toEqual({ proposed: true, weekIndex: 0 });
  });

  it('rejects proposing onto a week whose targets are already locked', async () => {
    const { handler, repository } = setup({ week: week('targets_locked') });

    await expect(handler.execute(cmd)).rejects.toThrow(/already locked/);
    expect(repository.proposeWeeklyTargets).not.toHaveBeenCalled();
  });

  it('throws when the week does not exist', async () => {
    const { handler, repository } = setup({ week: null });

    await expect(handler.execute(cmd)).rejects.toThrow(/week not found/i);
    expect(repository.proposeWeeklyTargets).not.toHaveBeenCalled();
  });
});
