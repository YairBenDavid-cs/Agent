import { ProgramWeek, WeekState } from '../../../domain/program.model';
import { AdvanceCurrentWeekCommand } from '../advance-current-week.command';
import { AdvanceCurrentWeekHandler } from '../advance-current-week.handler';

function week(
  weekIndex: number,
  status: ProgramWeek['status'],
  weekState: WeekState = 'open',
): ProgramWeek {
  return {
    weekIndex,
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    theme: 'build',
    plannedLoadTarget: null,
    planState: 'committed',
    status,
    generatedAt: null,
    weekState,
    weeklyTargets: null,
  };
}

function setup(opts: { program: { currentWeekIndex: number; weeks: ProgramWeek[] } | null }) {
  const repository = {
    findById: jest.fn(() => Promise.resolve(opts.program)),
    updateWeeks: jest.fn(() => Promise.resolve()),
  };
  const handler = new AdvanceCurrentWeekHandler(repository as never);
  return { handler, repository };
}

describe('AdvanceCurrentWeekHandler', () => {
  it('flips the current week to done and the target week to current once the current week is locked', async () => {
    const { handler, repository } = setup({
      program: {
        currentWeekIndex: 0,
        weeks: [week(0, 'current', 'locked'), week(1, 'upcoming')],
      },
    });

    const res = await handler.execute(
      new AdvanceCurrentWeekCommand('u1', 'p1', 1),
    );

    expect(repository.updateWeeks).toHaveBeenCalledWith(
      'u1',
      'p1',
      [
        expect.objectContaining({ weekIndex: 0, status: 'done' }),
        expect.objectContaining({ weekIndex: 1, status: 'current' }),
      ],
      1,
    );
    expect(res).toEqual({ advanced: true, currentWeekIndex: 1 });
  });

  it('refuses to advance while the current week is not locked yet (still mid-build)', async () => {
    const { handler, repository } = setup({
      program: {
        currentWeekIndex: 0,
        weeks: [week(0, 'current', 'targets_locked'), week(1, 'upcoming')],
      },
    });

    await expect(
      handler.execute(new AdvanceCurrentWeekCommand('u1', 'p1', 1)),
    ).rejects.toThrow(/not locked yet/);
    expect(repository.updateWeeks).not.toHaveBeenCalled();
  });

  it('rejects a target week that is not ahead of the current week', async () => {
    const { handler, repository } = setup({
      program: {
        currentWeekIndex: 1,
        weeks: [week(0, 'done', 'locked'), week(1, 'current', 'locked')],
      },
    });

    await expect(
      handler.execute(new AdvanceCurrentWeekCommand('u1', 'p1', 0)),
    ).rejects.toThrow(/not ahead of/);
    expect(repository.updateWeeks).not.toHaveBeenCalled();
  });

  it('throws when the target week is not in the program skeleton (past horizon)', async () => {
    const { handler, repository } = setup({
      program: {
        currentWeekIndex: 0,
        weeks: [week(0, 'current', 'locked')],
      },
    });

    await expect(
      handler.execute(new AdvanceCurrentWeekCommand('u1', 'p1', 1)),
    ).rejects.toThrow(/not found/i);
    expect(repository.updateWeeks).not.toHaveBeenCalled();
  });

  it('throws when the program does not exist', async () => {
    const { handler } = setup({ program: null });

    await expect(
      handler.execute(new AdvanceCurrentWeekCommand('u1', 'p1', 1)),
    ).rejects.toThrow(/program not found/i);
  });
});
