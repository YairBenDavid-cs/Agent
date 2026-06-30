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
import {
  AvailabilityWindow,
  proposeSlots,
  SlotCandidate,
} from '../build/slot-proposer';

export interface PlaceWeekOptions {
  weekWindow: { from: string; to: string };
  /** IANA tz the orchestrator resolved for this user. */
  timezone: string;
}

/** Inputs for proposing/validating a single session's calendar slot (BW3). */
export interface SlotRequest {
  weekWindow: { from: string; to: string };
  timezone: string;
  durationMin: number;
  /** Soft day-type hint to rank candidates near (the session placeholder date). */
  preferredDate?: string | null;
  /** How many candidate slots to return (default 3). */
  limit?: number;
}

/** The live scheduling constraints for a target week. */
interface WeekConstraints {
  availability: AvailabilityWindow[];
  busy: BusyInterval[];
  hardBlocked: HardWindow[];
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

  /**
   * BW3 — propose concrete, clash-free calendar slots for ONE session, computed
   * from the user's recurring availability minus the LIVE calendar busy blocks
   * and HARD windows (same clash logic the irreversible write uses). Returns a
   * ranked, bounded candidate list the orchestrator surfaces as picks in chat.
   */
  async proposeSlotsForSession(
    userId: string,
    req: SlotRequest,
  ): Promise<SlotCandidate[]> {
    const constraints = await this.gatherConstraints(
      userId,
      req.weekWindow,
      req.timezone,
    );
    return proposeSlots({
      weekWindow: req.weekWindow,
      availability: constraints.availability,
      durationMin: req.durationMin,
      busy: constraints.busy,
      hardBlocked: constraints.hardBlocked,
      timezone: req.timezone,
      preferredDate: req.preferredDate ?? null,
      limit: req.limit ?? 3,
    });
  }

  /**
   * BW3 — re-validate a single chosen slot against the LIVE calendar at confirm
   * time (a slot can go stale between propose and pick). Returns a (possibly
   * empty) violation list; empty = safe to write. Reuses the pre-write validator.
   */
  async validateSlot(
    userId: string,
    req: { weekWindow: { from: string; to: string }; timezone: string },
    slot: SlotCandidate,
  ): Promise<string[]> {
    const constraints = await this.gatherConstraints(
      userId,
      req.weekWindow,
      req.timezone,
    );
    return validatePlacement({
      placed: [
        {
          plannedSessionId: 'confirm',
          scheduledDate: slot.scheduledDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          scheduledStartUtc: slot.scheduledStartUtc,
        },
      ],
      busy: constraints.busy,
      hardBlocked: constraints.hardBlocked,
    });
  }

  /** Gather availability + live busy + hard windows for a target week. */
  private async gatherConstraints(
    userId: string,
    weekWindow: { from: string; to: string },
    timezone: string,
  ): Promise<WeekConstraints> {
    const [seed, busy] = await Promise.all([
      this.seeds.buildPlannerSeed(userId, weekWindow, timezone),
      this.fetchBusy(userId, weekWindow),
    ]);
    // PlannerSeed.availability is the training profile's AvailabilitySlot[]
    // ({ day, startTime, endTime }); normalise to the proposer's window shape.
    const availability: AvailabilityWindow[] = (
      seed.availability as Array<{ day: string; startTime: string; endTime: string }>
    ).map((a) => ({ day: a.day, start: a.startTime, end: a.endTime }));
    return { availability, busy, hardBlocked: seed.hardBlockedWindows };
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
