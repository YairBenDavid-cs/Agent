import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { ApiError } from '../../../common/errors/api-error';
import { TriggerContextResolver } from '../../triggers/trigger-context.resolver';
import {
  AutoModeOrchestratorService,
  RunAutoModeOutcome,
} from '../auto-mode-orchestrator.service';
import { AutoModeRun } from '../domain/auto-mode-run.model';
import { ListAutoModeRunsQuery } from '../application/queries/list-auto-mode-runs.query';
import {
  RevertAutoModeRunCommand,
  RevertAutoModeRunResult,
} from '../application/commands/revert-auto-mode-run.command';
import { RunAutoModeDto } from './dto/run-auto-mode.dto';

/**
 * Explicit manual trigger for Auto Mode (M4.5) — the "Auto Mode" button on the
 * program page, as opposed to the two other triggers (a chat message sent
 * while `mode: 'auto'`, and the scheduled weekly-rollover). All three funnel
 * into the same `AutoModeOrchestratorService.runAutoMode`, so lock/audit/
 * explanation behavior never drifts by trigger.
 */
@Controller('assistant/auto-mode')
export class AutoModeController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly orchestrator: AutoModeOrchestratorService,
    private readonly triggerContext: TriggerContextResolver,
  ) {}

  /** POST /assistant/auto-mode/run — kick off one autonomous run on the current week. */
  @Post('run')
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RunAutoModeDto,
  ): Promise<RunAutoModeOutcome> {
    const ctx = await this.triggerContext.resolve(user.userId);
    if (!ctx) {
      throw ApiError.badRequest(
        'No active program — generate a program before running Auto Mode.',
      );
    }

    return this.orchestrator.runAutoMode({
      userId: user.userId,
      programId: ctx.programId,
      weekIndex: ctx.weekIndex,
      timezone: ctx.timezone,
      scenario: dto.scenario,
      trigger: 'manual_trigger',
      weeklyTargetsEditRequest: dto.weeklyTargetsEditRequest ?? null,
      sessionEditRequest: dto.sessionEditRequest ?? null,
      sessionTimeEditRequest: dto.sessionTimeEditRequest ?? null,
    });
  }

  /** GET /assistant/auto-mode/runs — the caller's recent runs, newest first. */
  @Get('runs')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<AutoModeRun[]> {
    return this.queryBus.execute<ListAutoModeRunsQuery, AutoModeRun[]>(
      new ListAutoModeRunsQuery(user.userId, limit ? Number(limit) : 20),
    );
  }

  /** POST /assistant/auto-mode/runs/:id/revert — undo a committed edit run. */
  @Post('runs/:id/revert')
  async revert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RevertAutoModeRunResult> {
    return this.commandBus.execute<RevertAutoModeRunCommand, RevertAutoModeRunResult>(
      new RevertAutoModeRunCommand(user.userId, id),
    );
  }
}
