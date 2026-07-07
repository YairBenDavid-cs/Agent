import {
  ProgramWeek,
  WeekState,
  WeeklyTargets,
} from '../../../domain/program.model';
import { ReviseWeeklyTargetsCommand } from '../revise-weekly-targets.command';
import { ReviseWeeklyTargetsHandler } from '../revise-weekly-targets.handler';

const REVISED_AT = '2026-07-07T09:00:00.000Z';

function week(
  weekState: WeekState = 'targets_locked',
  weeklyTargets: WeeklyTargets | null = {
    sessionCount: 4,
    totalVolume: 40,
    keyGoals: ['one quality tempo'],
    lockedAt: '2026-06-29T09:00:00.000Z',
  },
): ProgramWeek {
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
    weeklyTargets,
  };
}

function setup(opts: { week: ProgramWeek | null }) {
  const repository = {
    findById: jest.fn(() =>
      Promise.resolve(opts.week ? { weeks: [opts.week] } : { weeks: [] }),
    ),
    reviseWeeklyTargets: jest.fn(() => Promise.resolve()),
  };
  const handler = new ReviseWeeklyTargetsHandler(repository as never);
  return { handler, repository };
}

const cmd = new ReviseWeeklyTargetsCommand(
  'u1',
  'p1',
  2,
  5,
  45,
  ['one quality tempo', 'a long run'],
  "user asked to add Friday's run",
  'session_edit',
);

describe('ReviseWeeklyTargetsHandler', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date(REVISED_AT));
  });
  afterAll(() => jest.useRealTimers());

  it('revises the quota in place on a targets_locked week', async () => {
    const { handler, repository } = setup({ week: week('targets_locked') });

    const res = await handler.execute(cmd);

    expect(repository.reviseWeeklyTargets).toHaveBeenCalledWith(
      'u1',
      'p1',
      2,
      { sessionCount: 5, totalVolume: 45, keyGoals: ['one quality tempo', 'a long run'] },
      {
        revisedAt: REVISED_AT,
        previous: {
          sessionCount: 4,
          totalVolume: 40,
          keyGoals: ['one quality tempo'],
        },
        reason: "user asked to add Friday's run",
        triggeredBy: 'session_edit',
      },
    );
    expect(res).toEqual({ revised: true, weekIndex: 2 });
  });

  it('revises the quota in place on a fully locked week', async () => {
    const { handler, repository } = setup({ week: week('locked') });

    const res = await handler.execute(cmd);

    expect(repository.reviseWeeklyTargets).toHaveBeenCalled();
    expect(res).toEqual({ revised: true, weekIndex: 2 });
  });

  it('rejects an open week (nothing locked yet to revise)', async () => {
    const { handler, repository } = setup({
      week: week('open', null),
    });

    await expect(handler.execute(cmd)).rejects.toThrow(/no locked targets/);
    expect(repository.reviseWeeklyTargets).not.toHaveBeenCalled();
  });

  it('throws when the week does not exist', async () => {
    const { handler, repository } = setup({ week: null });

    await expect(handler.execute(cmd)).rejects.toThrow(/week not found/i);
    expect(repository.reviseWeeklyTargets).not.toHaveBeenCalled();
  });
});
