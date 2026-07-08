import { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { ApiError } from '../../../../common/errors/api-error';
import { ListAutoModeRunsQuery } from '../../application/queries/list-auto-mode-runs.query';
import { RevertAutoModeRunCommand } from '../../application/commands/revert-auto-mode-run.command';
import { AutoModeController } from '../auto-mode.controller';
import { RunAutoModeDto } from '../dto/run-auto-mode.dto';

const USER: AuthenticatedUser = { userId: 'u1', role: 'user' };

function setup() {
  const commandBus = { execute: jest.fn() };
  const queryBus = { execute: jest.fn() };
  const orchestrator = { runAutoMode: jest.fn() };
  const triggerContext = { resolve: jest.fn() };

  const controller = new AutoModeController(
    commandBus as never,
    queryBus as never,
    orchestrator as never,
    triggerContext as never,
  );

  return { controller, commandBus, queryBus, orchestrator, triggerContext };
}

function dto(overrides: Partial<RunAutoModeDto> = {}): RunAutoModeDto {
  return Object.assign(new RunAutoModeDto(), { scenario: 'new_week' }, overrides);
}

describe('AutoModeController', () => {
  describe('run', () => {
    it('throws ApiError.badRequest when there is no active program, without calling the orchestrator', async () => {
      const { controller, triggerContext, orchestrator } = setup();
      triggerContext.resolve.mockResolvedValueOnce(null);

      await expect(controller.run(USER, dto())).rejects.toThrow(ApiError);
      expect(orchestrator.runAutoMode).not.toHaveBeenCalled();
    });

    it('calls orchestrator.runAutoMode with the resolved context, manual trigger, and dto fields', async () => {
      const { controller, triggerContext, orchestrator } = setup();
      triggerContext.resolve.mockResolvedValueOnce({
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        discipline: 'running',
        weekWindow: { from: '2026-07-06', to: '2026-07-12' },
      });
      const outcome = { run: {}, conversationId: 'c1', assistantMessageId: 'm1', reply: 'ok' };
      orchestrator.runAutoMode.mockResolvedValueOnce(outcome);

      const result = await controller.run(
        USER,
        dto({
          scenario: 'weekly_targets_edit',
          weeklyTargetsEditRequest: { sessionCount: 5, totalVolume: 45, reason: 'more volume' } as never,
        }),
      );

      expect(orchestrator.runAutoMode).toHaveBeenCalledWith({
        userId: 'u1',
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
        scenario: 'weekly_targets_edit',
        trigger: 'manual_trigger',
        weeklyTargetsEditRequest: { sessionCount: 5, totalVolume: 45, reason: 'more volume' },
        sessionEditRequest: null,
        sessionTimeEditRequest: null,
      });
      expect(result).toBe(outcome);
    });

    it('defaults all 3 edit-request fields to null when omitted from the dto', async () => {
      const { controller, triggerContext, orchestrator } = setup();
      triggerContext.resolve.mockResolvedValueOnce({
        programId: 'p1',
        weekIndex: 2,
        timezone: 'UTC',
      });
      orchestrator.runAutoMode.mockResolvedValueOnce({});

      await controller.run(USER, dto({ scenario: 'new_week' }));

      expect(orchestrator.runAutoMode).toHaveBeenCalledWith(
        expect.objectContaining({
          weeklyTargetsEditRequest: null,
          sessionEditRequest: null,
          sessionTimeEditRequest: null,
        }),
      );
    });
  });

  describe('list', () => {
    it('parses a given limit query param as a number', async () => {
      const { controller, queryBus } = setup();
      queryBus.execute.mockResolvedValueOnce([]);

      await controller.list(USER, '5');

      expect(queryBus.execute).toHaveBeenCalledWith(new ListAutoModeRunsQuery('u1', 5));
    });

    it('defaults limit to 20 when the query param is omitted', async () => {
      const { controller, queryBus } = setup();
      queryBus.execute.mockResolvedValueOnce([]);

      await controller.list(USER, undefined);

      expect(queryBus.execute).toHaveBeenCalledWith(new ListAutoModeRunsQuery('u1', 20));
    });
  });

  describe('revert', () => {
    it('delegates to commandBus.execute with RevertAutoModeRunCommand and returns its result', async () => {
      const { controller, commandBus } = setup();
      const result = { reverted: true };
      commandBus.execute.mockResolvedValueOnce(result);

      const outcome = await controller.revert(USER, 'run-1');

      expect(commandBus.execute).toHaveBeenCalledWith(new RevertAutoModeRunCommand('u1', 'run-1'));
      expect(outcome).toBe(result);
    });
  });
});
