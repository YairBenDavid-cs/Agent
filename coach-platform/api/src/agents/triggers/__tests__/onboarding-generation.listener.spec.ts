import { CreateProgramCommand } from '../../../program/application/commands/create-program.command';
import { GetActiveProgramQuery } from '../../../program/application/queries/get-active-program.query';
import { GetTrainingProfileQuery } from '../../../training/application/queries/get-training-profile.query';
import { GetUserQuery } from '../../../users/application/queries/get-user.query';
import { TrainingProfileCreatedEvent } from '../../../training/application/events/training-profile-created.event';
import { StartConversationCommand } from '../../conversation/application/commands/start-conversation.command';
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
  startBuild: jest.Mock;
  commandExecute: jest.Mock;
}

function makeListener(activeProgram: unknown): Harness {
  // Commands: CreateProgram → { programId }, StartConversation → { conversationId }.
  const commandExecute = jest.fn((command: unknown) => {
    if (command instanceof StartConversationCommand) {
      return Promise.resolve({ conversationId: 'convo-1' });
    }
    return Promise.resolve({ programId: 'new-prog' });
  });

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
  const startBuild = jest.fn().mockResolvedValue(undefined);
  const orchestrator = { startBuild };

  const listener = new OnboardingGenerationListener(
    queryBus as never,
    commandBus as never,
    resolver as never,
    orchestrator as never,
  );
  return { listener, startBuild, commandExecute };
}

const fire = (l: OnboardingGenerationListener) =>
  l.handle(new TrainingProfileCreatedEvent({ userId: USER }));

/** Pull the StartConversationCommand the listener dispatched, if any. */
function startConvoCall(commandExecute: jest.Mock): StartConversationCommand | undefined {
  const call = commandExecute.mock.calls.find(
    (c) => c[0] instanceof StartConversationCommand,
  );
  return call?.[0] as StartConversationCommand | undefined;
}

describe('OnboardingGenerationListener', () => {
  it('skips when the user already has a built program', async () => {
    const { listener, startBuild, commandExecute } = makeListener(builtProgram());

    await fire(listener);

    expect(commandExecute).not.toHaveBeenCalled(); // no seed, no conversation
    expect(startBuild).not.toHaveBeenCalled(); // no build kicked off
  });

  it('seeds a program and opens a program_build conversation for a first-time user', async () => {
    const { listener, startBuild, commandExecute } = makeListener({
      hasProgram: false,
      program: null,
    });

    await fire(listener);

    // CreateProgram (seed) + StartConversation.
    expect(commandExecute.mock.calls[0][0]).toBeInstanceOf(CreateProgramCommand);
    const start = startConvoCall(commandExecute);
    expect(start).toBeInstanceOf(StartConversationCommand);
    expect(start?.opts).toMatchObject({
      mode: 'plan',
      origin: 'system',
      attention: true,
      purpose: 'program_build',
      buildContext: { programId: 'new-prog', weekIndex: 0 },
    });

    expect(startBuild).toHaveBeenCalledTimes(1);
    expect(startBuild.mock.calls[0][0]).toMatchObject({
      userId: USER,
      conversationId: 'convo-1',
      programId: 'new-prog',
      discipline: 'running',
      weekIndex: 0,
    });
  });

  it('resumes the build on a bare seed without re-seeding', async () => {
    const { listener, startBuild, commandExecute } = makeListener(
      unbuiltProgram('seed-prog'),
    );

    await fire(listener);

    // No CreateProgram — reuse the existing seed.
    expect(
      commandExecute.mock.calls.some((c) => c[0] instanceof CreateProgramCommand),
    ).toBe(false);
    const start = startConvoCall(commandExecute);
    expect(start?.opts.buildContext).toEqual({
      programId: 'seed-prog',
      weekIndex: 0,
    });
    expect(startBuild).toHaveBeenCalledTimes(1);
    expect(startBuild.mock.calls[0][0].programId).toBe('seed-prog');
  });

  it('does not throw when build wiring fails (fire-and-forget)', async () => {
    const { listener, startBuild } = makeListener({
      hasProgram: false,
      program: null,
    });
    startBuild.mockRejectedValueOnce(new Error('coach down'));

    await expect(fire(listener)).resolves.toBeUndefined();
  });
});
