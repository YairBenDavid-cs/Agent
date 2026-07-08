import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AgenticLoopResult } from '../shared/llm/agentic-loop.runtime';
import { CoachService } from '../coach/coach.service';
import { PlacementReport } from '../planner/planner.contracts';
import { PlannerService } from '../planner/planner.service';
import { RecoveryService } from '../recovery/recovery.service';
import { RecoveryVerdict } from '../recovery/recovery.contracts';
import { CalendarSyncService } from '../approval/calendar-sync.service';
import { GetWeekQuery } from '../../planned-sessions/application/queries/get-week.query';
import { PlannedSessionResponse } from '../../planned-sessions/application/dto/planned-session.response';
import { UpsertSessionScheduleCommand } from '../../planned-sessions/application/commands/upsert-session-schedule.command';
import {
  Pipeline,
  PipelineRunContext,
  PipelineRunResult,
  SessionEditRequest,
} from './pipeline.types';
import { resolveSessionReschedule } from './session-reschedule.policy';

/**
 * The deterministic orchestrator. A plain state machine — NOT an LLM manager —
 * that runs the minimal sufficient pipeline by sequencing the specialist agents.
 * The LLM intelligence lives INSIDE each agent; this layer owns choreography,
 * fail-safe semantics, and replayability.
 *
 * Fail-safe: every agent stage writes TENTATIVE-only; if a stage fails (no
 * terminal result / loop exhausted) the run ABORTS and surfaces the reason —
 * nothing user-visible is committed (commit + Google sync happen later, at
 * approval). Pipelines 2–4 are subsets of pipeline 1.
 */
@Injectable()
export class OrchestratorSaga {
  private readonly logger = new Logger(OrchestratorSaga.name);

  constructor(
    private readonly coach: CoachService,
    private readonly recovery: RecoveryService,
    private readonly planner: PlannerService,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  async run(
    pipeline: Pipeline,
    ctx: PipelineRunContext,
  ): Promise<PipelineRunResult> {
    const result: PipelineRunResult = {
      pipeline,
      status: 'completed',
      stages: [],
      recoveryVerdict: null,
      placement: null,
    };

    try {
      switch (pipeline) {
        case Pipeline.WRITE_ONLY:
          // No agents — the caller already appended the event + rebuilt the
          // projection. Nothing for the saga to do.
          return result;

        case Pipeline.PROGRAM_GENERATION:
          await this.runProgramGeneration(ctx, result);
          break;

        case Pipeline.FULL_SESSION_DAY:
        case Pipeline.SAFETY_REPLAN:
          await this.runGatedReplan(ctx, result);
          break;

        case Pipeline.CONTENT_REPLAN:
          await this.runContentReplan(ctx, result);
          break;

        case Pipeline.TIMING_REPLACE:
          await this.runTimingReplace(ctx, result);
          break;

        case Pipeline.SESSION_CONTENT_REPLAN:
          await this.runSessionContentReplan(ctx, result);
          break;

        case Pipeline.TARGET_REVISION_REPLAN:
          await this.runTargetRevisionReplan(ctx, result);
          break;

        case Pipeline.SESSION_RESCHEDULE:
          await this.runSessionReschedule(ctx, result);
          break;
      }
    } catch (err) {
      result.status = 'aborted';
      result.abortReason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Pipeline ${pipeline} aborted for run ${ctx.runId}: ${result.abortReason}`,
      );
    }

    return result;
  }

  // ── pipeline bodies ──────────────────────────────────────────────────────

  /**
   * 5: skeleton -> Step A (lock weekly targets) -> Step B (sessions) -> place.
   *
   * Iterative-flow swap: the macro budget is locked BEFORE any session is
   * drafted, so Step B's per-session drafting is bounded by the frozen quota
   * (`validateAgainstWeeklyTargets`). Everything stays tentative — commit +
   * Google sync still happen later at approval (fail-safe contract).
   */
  private async runProgramGeneration(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('coach.generateProgram');
    this.requireTerminal(
      await this.coach.generateProgram(ctx.userId, ctx.runId, ctx.discipline),
      'coach.generateProgram',
    );

    result.stages.push('coach.generateWeeklyTargets');
    this.requireTerminal(
      await this.coach.generateWeeklyTargets(
        ctx.userId,
        ctx.runId,
        ctx.discipline,
        { weekIndex: ctx.weekIndex, timezone: ctx.timezone },
      ),
      'coach.generateWeeklyTargets',
    );

    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  /** 1 + 2: Recovery gate -> Coach revise whole week -> place. */
  private async runGatedReplan(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('recovery.assessReadiness');
    const verdict = this.requireTerminal(
      await this.recovery.assessReadiness(ctx.userId, ctx.runId, {
        weekWindow: ctx.weekWindow,
      }),
      'recovery.assessReadiness',
    );
    result.recoveryVerdict = verdict;

    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
        readiness: verdict.readiness,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  /** 3: Coach re-plans the week -> place. */
  private async runContentReplan(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  /** 4: Planner re-place only. */
  private async runTimingReplace(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    await this.place(ctx, result);
  }

  /**
   * 7: (optional) revise the week's locked targets, if the athlete already
   * confirmed the breach → Coach redrafts the one edited session → place.
   * Only reached once the deterministic decision layer has already resolved
   * `weekIndex`/confirmation — this never runs off a raw LLM tool call.
   */
  private async runSessionContentReplan(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    const edits: SessionEditRequest[] =
      ctx.sessionEdits && ctx.sessionEdits.length > 0
        ? ctx.sessionEdits
        : ctx.sessionEdit
          ? [ctx.sessionEdit]
          : [];
    if (edits.length === 0) {
      throw new Error(
        'SESSION_CONTENT_REPLAN requires ctx.sessionEdit or ctx.sessionEdits.',
      );
    }
    if (!ctx.programId || ctx.weekIndex === undefined) {
      throw new Error(
        'SESSION_CONTENT_REPLAN requires ctx.programId and ctx.weekIndex.',
      );
    }

    // Any confirmed target cascade rides on the first edit; revise ONCE so
    // every subsequent redraft is bounded by the new locked budget.
    const cascade = edits.find((e) => e.revisedTargets);
    if (cascade?.revisedTargets) {
      result.stages.push('coach.reviseWeeklyTargets');
      await this.coach.reviseWeeklyTargets(
        ctx.userId,
        ctx.programId,
        ctx.weekIndex,
        cascade.revisedTargets,
        'session_edit',
        `Session edit "${cascade.plannedSessionId}": ${cascade.requestedChangeDescription}`,
      );
    }

    for (const edit of edits) {
      result.stages.push('coach.reviseSessionContent');
      this.requireTerminal(
        await this.coach.reviseSessionContent(ctx.userId, ctx.runId, ctx.discipline, {
          programId: ctx.programId,
          weekIndex: ctx.weekIndex,
          timezone: ctx.timezone,
          plannedSessionId: edit.plannedSessionId,
          requestedChangeDescription: edit.requestedChangeDescription,
        }),
        'coach.reviseSessionContent',
      );
    }

    await this.place(ctx, result);
  }

  /**
   * 9: deterministic single-session move — NO LLM. Code computes the new
   * schedule (end time from estDurationMin, UTC instant from the timezone),
   * validates one-session-per-day + the minimum recovery gap against the rest
   * of the week, and writes it directly. Content is untouched. A committed
   * session's owned calendar event is re-synced in place.
   */
  private async runSessionReschedule(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    const req = ctx.sessionReschedule;
    if (!req) {
      throw new Error('SESSION_RESCHEDULE requires ctx.sessionReschedule.');
    }
    if (!ctx.programId || ctx.weekIndex === undefined) {
      throw new Error(
        'SESSION_RESCHEDULE requires ctx.programId and ctx.weekIndex.',
      );
    }

    result.stages.push('schedule.rescheduleSession');
    const week = await this.queryBus.execute<
      GetWeekQuery,
      PlannedSessionResponse[]
    >(new GetWeekQuery(ctx.userId, ctx.programId, ctx.weekIndex));

    const target = week.find((s) => s.id === req.plannedSessionId);
    if (!target) {
      throw new Error(
        `Session ${req.plannedSessionId} was not found in week ${ctx.weekIndex}.`,
      );
    }

    const { schedule, violations } = resolveSessionReschedule(
      {
        plannedSessionId: target.id,
        newDate: req.newDate ?? target.scheduledDate,
        newStartTime: req.newStartTime ?? target.startTime,
        timezone: target.timezone || ctx.timezone,
        estDurationMin: target.estDurationMin,
      },
      week.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledDate: s.scheduledDate,
        scheduledStartUtc: s.scheduledStartUtc,
      })),
    );
    if (!schedule) {
      throw new Error(`Cannot move the session: ${violations.join(' ')}`);
    }

    await this.commandBus.execute(
      new UpsertSessionScheduleCommand(ctx.userId, target.id, schedule),
    );

    // A committed session already projects onto an owned calendar event —
    // push the new time immediately (tentative sessions sync later, at commit).
    if (target.planState === 'committed') {
      result.stages.push('calendar.syncSession');
      await this.calendarSync.syncWeek(ctx.userId, [
        { ...target, ...schedule },
      ]);
    }
  }

  /**
   * 8: revise the week's locked targets directly → Coach reflows the week's
   * still-tentative sessions to fit the new budget → place. Committed sessions
   * are never touched (`replaceTentativeWeek` only overwrites tentative slots).
   */
  private async runTargetRevisionReplan(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    const revision = ctx.targetRevision;
    if (!revision) {
      throw new Error('TARGET_REVISION_REPLAN requires ctx.targetRevision.');
    }
    if (!ctx.programId || ctx.weekIndex === undefined) {
      throw new Error(
        'TARGET_REVISION_REPLAN requires ctx.programId and ctx.weekIndex.',
      );
    }

    result.stages.push('coach.reviseWeeklyTargets');
    await this.coach.reviseWeeklyTargets(
      ctx.userId,
      ctx.programId,
      ctx.weekIndex,
      revision.newTargets,
      'direct_target_change',
      revision.reason,
    );

    result.stages.push('coach.generateWeek');
    this.requireTerminal(
      await this.coach.generateWeek(ctx.userId, ctx.runId, ctx.discipline, {
        weekIndex: ctx.weekIndex,
        timezone: ctx.timezone,
      }),
      'coach.generateWeek',
    );

    await this.place(ctx, result);
  }

  // ── shared stage ─────────────────────────────────────────────────────────

  private async place(
    ctx: PipelineRunContext,
    result: PipelineRunResult,
  ): Promise<void> {
    result.stages.push('planner.placeWeek');
    const placement = this.requireTerminal(
      await this.planner.placeWeek(ctx.userId, ctx.runId, {
        weekWindow: ctx.weekWindow,
        timezone: ctx.timezone,
      }),
      'planner.placeWeek',
    );
    result.placement = placement;

    if (placement.unplaceable.length > 0) {
      // A genuine conflict the Planner could not auto-resolve. The Coach
      // sacrifice + user HITL loop is the approval/card flow's job (later
      // phase); here we surface it on the result rather than dropping sessions.
      this.logger.log(
        `Run ${ctx.runId}: ${placement.unplaceable.length} unplaceable session(s) — surfacing for conflict resolution.`,
      );
    }
  }

  /** Unwrap an agent loop result or fail the run (fail-safe: nothing commits). */
  private requireTerminal<T>(
    loop: AgenticLoopResult<T>,
    stage: string,
  ): T {
    if (loop.exhausted || loop.terminalResult === null) {
      throw new Error(
        `${stage} produced no terminal result (exhausted=${loop.exhausted}, iterations=${loop.iterations}).`,
      );
    }
    return loop.terminalResult;
  }
}
