import { GetActiveProgramQuery } from '../../../program/application/queries/get-active-program.query';
import { GetUserQuery } from '../../../users/application/queries/get-user.query';
import { TriggerContextResolver } from '../trigger-context.resolver';

interface StubResponses {
  program: unknown;
  user: unknown;
}

function makeResolver(responses: StubResponses): TriggerContextResolver {
  const queryBus = {
    execute: (query: unknown) => {
      if (query instanceof GetActiveProgramQuery) {
        return Promise.resolve(responses.program);
      }
      if (query instanceof GetUserQuery) {
        return Promise.resolve(responses.user);
      }
      return Promise.reject(new Error('unexpected query'));
    },
  };
  return new TriggerContextResolver(queryBus as never);
}

const programWith = (overrides: Record<string, unknown> = {}) => ({
  hasProgram: true,
  program: {
    id: 'prog-1',
    discipline: 'running',
    currentWeekIndex: 2,
    weeks: [
      { weekIndex: 1, startDate: '2026-06-15', endDate: '2026-06-21' },
      { weekIndex: 2, startDate: '2026-06-22', endDate: '2026-06-28' },
    ],
    ...overrides,
  },
});

describe('TriggerContextResolver', () => {
  it('resolves the current week window, index, discipline and timezone', async () => {
    const resolver = makeResolver({
      program: programWith(),
      user: { timezone: 'Europe/Berlin' },
    });

    const ctx = await resolver.resolve('user-1');

    expect(ctx).toEqual({
      programId: 'prog-1',
      discipline: 'running',
      timezone: 'Europe/Berlin',
      weekIndex: 2,
      weekWindow: { from: '2026-06-22', to: '2026-06-28' },
    });
  });

  it('falls back to UTC when the user has no timezone', async () => {
    const resolver = makeResolver({
      program: programWith(),
      user: { timezone: null },
    });

    const ctx = await resolver.resolve('user-1');
    expect(ctx?.timezone).toBe('UTC');
  });

  it('returns null when the user has no active program', async () => {
    const resolver = makeResolver({
      program: { hasProgram: false, program: null },
      user: { timezone: 'UTC' },
    });

    expect(await resolver.resolve('user-1')).toBeNull();
  });

  it('returns null when the current week index has no matching week', async () => {
    const resolver = makeResolver({
      program: programWith({ currentWeekIndex: 99 }),
      user: { timezone: 'UTC' },
    });

    expect(await resolver.resolve('user-1')).toBeNull();
  });
});
