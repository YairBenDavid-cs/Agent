import { CreateProgramCommand } from '../../../program/application/commands/create-program.command';
import { GetActiveProgramQuery } from '../../../program/application/queries/get-active-program.query';
import { GetTrainingProfileQuery } from '../../../training/application/queries/get-training-profile.query';
import { GetUserQuery } from '../../../users/application/queries/get-user.query';
import { TrainingProfileCreatedEvent } from '../../../training/application/events/training-profile-created.event';
import { Pipeline } from '../../orchestrator/pipeline.types';
import { OnboardingGenerationListener } from '../onboarding-generation.listener';

const USER = 'user-1';

const RESOLVED_CTX = {
  programId: 'ctx-prog',
  discipline: 'running' as const,
  timezone: 'Europe/Berlin',
  weekIndex: 0,
  weekWindow: { from: '2026-06-29', to: '2026-07-05' },
};

const PROFILE = {
  discipline: 'running',
  goal: { primaryGoal: 'finish a 10k', note: null, horizon: '2026-09-01' },
};

/** A bare seed: current week exists but was never generated. */
const unbuiltProgram = (id = 'seed-prog') => ({
  hasProgram: true,
  program: {
    id,
    currentWeekIndex: 0,
    weeks: [{ weekIndex: 0, generatedAt: null }],
  },
});

/** A finished program: its current week carries a generation timestamp. */
const builtProgram = (id = 'built-prog') => ({
  hasProgram: true,
  program: {
    id,
    currentWeekIndex: 0,
    weeks: [{ weekIndex: 0, generatedAt: '2026-06-20T10:00:00.000Z' }],
  },
});

interface Harness {
  listener: OnboardingGenerationListener;
  enqueue: jest.Mock;
  commandExecute: jest.Mock;
}

function makeListener(activeProgram: unknown): Harness {
  const commandExecute = jest
    .fn()
    .mockResolvedValue({ programId: 'new-prog' });

  const queryBus = {
    execute: (query: unknown) => {
      if (query instanceof GetActiveProgramQuery) {
        return Promise.resolve(activeProgram);
      }
      if (query instanceof GetTrainingProfileQuery) {
        return Promise.resolve({ profile: PROFILE });
      }
      if (query instanceof GetUserQuery) {
        return Promise.resolve({ timezone: 'Europe/Berlin' });
      }
      return Promise.reject(new Error('unexpected query'));
    },
  };

  const commandBus = { execute: commandExecute };
  const resolver = { resolve: jest.fn().mockResolvedValue(RESOLVED_CTX) };
  const enqueue = jest.fn().mockResolvedValue(null);
  const queue = { enqueue };

  const listener = new OnboardingGenerationListener(
    queryBus as never,
    commandBus as never,
    resolver as never,
    queue as never,
  );
  return { listener, enqueue, commandExecute };
}

const fire = (l: OnboardingGenerationListener) =>
  l.handle(new TrainingProfileCreatedEvent({ userId: USER }));

describe('OnboardingGenerationListener', () => {
  it('skips when the user already has a built program', async () => {
    const { listener, enqueue, commandExecute } = makeListener(builtProgram());

    await fire(listener);

    expect(commandExecute).not.toHaveBeenCalled(); // no seed
    expect(enqueue).not.toHaveBeenCalled(); // no generation
  });

  it('seeds a program and enqueues generation for a first-time user', async () => {
    const { listener, enqueue, commandExecute } = makeListener({
      hasProgram: false,
      program: null,
    });

    await fire(listener);

    expect(commandExecute).toHaveBeenCalledTimes(1);
    expect(commandExecute.mock.calls[0][0]).toBeInstanceOf(CreateProgramCommand);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const job = enqueue.mock.calls[0][0];
    expect(job.pipeline).toBe(Pipeline.PROGRAM_GENERATION);
    expect(job.ctx.userId).toBe(USER);
  });

  it('resumes generation on a bare seed without re-seeding', async () => {
    const { listener, enqueue, commandExecute } = makeListener(
      unbuiltProgram('seed-prog'),
    );

    await fire(listener);

    expect(commandExecute).not.toHaveBeenCalled(); // reuse the existing seed
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].pipeline).toBe(Pipeline.PROGRAM_GENERATION);
  });

  it('uses a unique runId so an interrupted run does not dedupe the resume', async () => {
    const a = makeListener(unbuiltProgram());
    const b = makeListener(unbuiltProgram());

    await fire(a.listener);
    await fire(b.listener);

    const runIdA = a.enqueue.mock.calls[0][0].ctx.runId as string;
    const runIdB = b.enqueue.mock.calls[0][0].ctx.runId as string;
    expect(runIdA).toContain('program-gen:onboarding:');
    expect(runIdA).not.toBe(runIdB);
  });

  it('does not throw when generation wiring fails (fire-and-forget)', async () => {
    const { listener, enqueue } = makeListener({
      hasProgram: false,
      program: null,
    });
    enqueue.mockRejectedValueOnce(new Error('queue down'));

    await expect(fire(listener)).resolves.toBeUndefined();
  });
});
