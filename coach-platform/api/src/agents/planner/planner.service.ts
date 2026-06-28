import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { GoogleCalendarClient } from '../../integrations/domain/google-calendar';
import {
  UpsertSessionScheduleCommand,
  UpsertSessionScheduleResult,
} from '../../planned-sessions/application/commands/upsert-session-schedule.command';
import {
  AgentToolContext,
  AnyAgentTool,
  defineTool,
} from '../shared/llm/agent-tool';
import {
  AgenticLoopResult,
  AgenticLoopRuntime,
} from '../shared/llm/agentic-loop.runtime';
import { ReadToolRegistry } from '../shared/read-tools/read-tool-registry.service';
import { SeedContextBuilder } from '../shared/seed/seed-context.builder';
import {
  CommitPlacementArgs,
  commitPlacementSchema,
  PlacementReport,
} from './planner.contracts';
import { PLANNER_SYSTEM_PROMPT } from './planner.prompt';
import {
  BusyInterval,
  HardWindow,
  validatePlacement,
} from './planner.prewrite-validator';

export interface PlaceWeekOptions {
  weekWindow: { from: string; to: string };
  /** IANA tz the orchestrator resolved for this user. */
  timezone: string;
}

/**
 * The Planner agent. Runs a bounded placement loop over the Coach's tentative
 * sessions + the LIVE Google Calendar + availability + scheduling windows. The
 * model makes the full placement decision; the terminal `commit_placement` tool
 * re-fetches the live calendar, runs the pre-write validator (bounce on any
 * violation), then writes each schedule THROUGH the CQRS command. App-side only
 * — the real Google event is created later, at commit.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly seeds: SeedContextBuilder,
    private readonly readTools: ReadToolRegistry,
    private readonly commandBus: CommandBus,
    private readonly calendar: GoogleCalendarClient,
  ) {}

  async placeWeek(
    userId: string,
    runId: string,
    opts: PlaceWeekOptions,
  ): Promise<AgenticLoopResult<PlacementReport>> {
    const seed = await this.seeds.buildPlannerSeed(
      userId,
      opts.weekWindow,
      opts.timezone,
    );
    const ctx: AgentToolContext = { userId, runId };

    const tools: AnyAgentTool[] = [
      ...this.readTools.forPlanner(),
      this.commitPlacementTool(seed.hardBlockedWindows, opts),
    ];

    return this.loop.run<PlacementReport>({
      agentName: 'planner',
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      seedMessage: `${seed.seedMessage}\n\n== TASK ==\nPlace every session-to-place for week ${opts.weekWindow.from}..${opts.weekWindow.to} and call commit_placement exactly once.`,
      tools,
      ctx,
      temperature: 0.2,
    });
  }

  private commitPlacementTool(
    hardBlocked: HardWindow[],
    opts: PlaceWeekOptions,
  ): AnyAgentTool {
    return defineTool<CommitPlacementArgs, PlacementReport>({
      name: 'commit_placement',
      description:
        'Persist the schedule for all placed sessions + report the unplaceable ones. Terminal: ends the run.',
      schema: commitPlacementSchema,
      terminal: true,
      handler: async (args, c) => {
        // Re-fetch the LIVE calendar so the guard validates against reality,
        // not against whatever the model claims is free.
        const busy = await this.fetchBusy(c.userId, opts.weekWindow);

        const violations = validatePlacement({
          placed: args.placed,
          busy,
          hardBlocked,
        });
        if (violations.length > 0) {
          throw new Error(`Placement rejected: ${violations.join(' ')}`);
        }

        for (const p of args.placed) {
          await this.commandBus.execute<
            UpsertSessionScheduleCommand,
            UpsertSessionScheduleResult
          >(
            new UpsertSessionScheduleCommand(c.userId, p.plannedSessionId, {
              scheduledDate: p.scheduledDate,
              startTime: p.startTime,
              endTime: p.endTime,
              timezone: args.timezone,
              scheduledStartUtc: p.scheduledStartUtc,
            }),
          );
        }

        return {
          placedCount: args.placed.length,
          unplaceable: args.unplaceable,
        };
      },
    });
  }

  /** Live busy intervals for the target week from the user's Google Calendar. */
  private async fetchBusy(
    userId: string,
    window: { from: string; to: string },
  ): Promise<BusyInterval[]> {
    const events = await this.calendar.listEvents(userId, {
      fromUtc: `${window.from}T00:00:00.000Z`,
      toUtc: `${window.to}T23:59:59.999Z`,
    });
    return events
      .filter((e) => e.busy && !e.appOwned)
      .map((e) => ({ startUtc: e.start, endUtc: e.end }));
  }
}
