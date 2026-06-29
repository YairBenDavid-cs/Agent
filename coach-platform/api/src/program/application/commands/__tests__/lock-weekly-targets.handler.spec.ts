import { ProgramWeek, WeekState } from '../../../domain/program.model';
import { LockWeeklyTargetsCommand } from '../lock-weekly-targets.command';
import { LockWeeklyTargetsHandler } from '../lock-weekly-targets.handler';

const LOCKED_AT = '2026-06-29T09:00:00.000Z';

function week(weekState: WeekState = 'open'): ProgramWeek {
  return {
    weekIndex: 2,
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    theme: 'build',
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
      Promise.resolve(
        opts.week ? { weeks: [opts.week] } : { weeks: [] },
      ),
    ),
    lockWeeklyTargets: jest.fn(() => Promise.resolve()),
  };
  const handler = new LockWeeklyTargetsHandler(repository as never);
  return { handler, repository };
}

const cmd = new LockWeeklyTargetsCommand(
  'u1',
  'p1',
  2,
  4,
  40,
  ['one quality tempo'],
  LOCKED_AT,
);

describe('LockWeeklyTargetsHandler', () => {
  it('freezes the quota on an open week', async () => {
    const { handler, repository } = setup({ week: week('open') });

    const res = await handler.execute(cmd);

    expect(repository.lockWeeklyTargets).toHaveBeenCalledWith('u1', 'p1', 2, {
      sessionCount: 4,
      totalVolume: 40,
      keyGoals: ['one quality tempo'],
      lockedAt: LOCKED_AT,
    });
    expect(res).toEqual({ locked: true, weekIndex: 2 });
  });

  it('rejects a week whose targets are already locked', async () => {
    const { handler, repository } = setup({ week: week('targets_locked') });

    await expect(handler.execute(cmd)).rejects.toThrow(/already locked/);
    expect(repository.lockWeeklyTargets).not.toHaveBeenCalled();
  });

  it('throws when the week does not exist', async () => {
    const { handler, repository } = setup({ week: null });

    await expect(handler.execute(cmd)).rejects.toThrow(/week not found/i);
    expect(repository.lockWeeklyTargets).not.toHaveBeenCalled();
  });
});
