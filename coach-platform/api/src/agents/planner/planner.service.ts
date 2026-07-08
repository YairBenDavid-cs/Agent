import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  OfferSlotsArgs,
  offerSlotsSchema,
  PlacementReport,
  SaveTimePreferenceArgs,
  saveTimePreferenceSchema,
} from './planner.contracts';
import { CaptureAssistantPreferenceCommand } from '../../personalization/application/commands/capture-assistant-preference.command';
import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import {
  PLANNER_SYSTEM_PROMPT,
  SLOT_CONVERSATION_PROMPT,
} from './planner.prompt';
import { ConversationContextService } from '../conversation/application/conversation-context.service';
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
import { toUtcInstant } from '../../common/util/scheduling';

/** "7:15" / "07:15" → "07:15"; null when not a sane wall-clock time. */
function normalizeHhMm(time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function hhMmToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhMm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Render a UTC instant as local "YYYY-MM-DD HH:mm" in the given IANA tz. */
function renderLocal(instantUtc: string, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instantUtc));
}

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
  /** Start instants (scheduledStartUtc) to skip — already offered and declined. */
  exclude?: string[];
  /** Local dates already holding a scheduled session (one session per day). */
  excludeDates?: string[];
}

/** The live scheduling constraints for a target week. */
interface WeekConstraints {
  availability: AvailabilityWindow[];
  busy: BusyInterval[];
  hardBlocked: HardWindow[];
}

/** Inputs for one LLM-led slot-conversation turn (BW3). */
export interface SlotConversationRequest {
  conversationId: string;
  /** The athlete's latest chat message ('' on the phase's opening turn). */
  userMessage: string;
  session: {
    id: string;
    title: string;
    durationMin: number;
    /** Soft day-type hint (the session's placeholder date), if any. */
    preferredDate?: string | null;
  };
  weekWindow: { from: string; to: string };
  timezone: string;
  /**
   * Local dates (YYYY-MM-DD) already holding a scheduled session this week —
   * excluded from the pool so no day gets two sessions.
   */
  takenDates?: string[];
}

/**
 * One slot-conversation turn's outcome: a concrete offer (every pick validated
 * live against the real blocks) or an interview/clarifying question.
 */
export type SlotConversationResult =
  | { kind: 'offer'; message: string; slots: SlotCandidate[] }
  | { kind: 'question'; message: string };

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
  private readonly logger = new Logger(PlannerService.name);

  constructor(
    private readonly loop: AgenticLoopRuntime,
    private readonly seeds: SeedContextBuilder,
    private readonly readTools: ReadToolRegistry,
    private readonly commandBus: CommandBus,
    private readonly calendar: GoogleCalendarClient,
    private readonly conversationContext: ConversationContextService,
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
      // A prose answer instead of commit_placement would abort the whole
      // pipeline — retry once forcing the tool before giving up.
      coerceTerminalTool: true,
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
      exclude: req.exclude,
      excludeDates: req.excludeDates,
    });
  }

  /**
   * BW3 — one LLM-led slot-conversation turn for ONE session. The model gets
   * the RAW picture — real blocks (live busy calendar, hard windows, taken
   * days) vs. soft preferences (preferred training windows) — plus the chat
   * history, computes the options ITSELF, and either offers 1–3 times via the
   * terminal `offer_slots` tool or replies in plain text (an interview/
   * clarifying question). Every pick is validated live against the REAL blocks
   * only, so a clashing offer is impossible while any genuinely free hour
   * (07:15 included) stays offerable. Explicit durable scheduling preferences
   * are captured mid-turn via `save_time_preference`. Throws on LLM
   * exhaustion — caller falls back to the deterministic path.
   */
  async converseSlot(
    userId: string,
    runId: string,
    req: SlotConversationRequest,
  ): Promise<SlotConversationResult> {
    const constraints = await this.gatherConstraints(
      userId,
      req.weekWindow,
      req.timezone,
    );

    const seedMessage = this.buildSlotSeed(req, constraints);
    const history = await this.conversationContext.buildHistory({
      userId,
      conversationId: req.conversationId,
      systemPrompt: SLOT_CONVERSATION_PROMPT,
      seed: seedMessage,
      nextUserMessage: '',
    });

    const res = await this.loop.run<{ message: string; slots: SlotCandidate[] }>({
      agentName: 'planner-slot-chat',
      systemPrompt: SLOT_CONVERSATION_PROMPT,
      seedMessage,
      history,
      tools: [
        this.saveTimePreferenceTool(),
        this.offerSlotsTool(req, constraints),
      ],
      ctx: { userId, runId },
      temperature: 0.4,
    });

    if (res.terminalTool === 'offer_slots' && res.terminalResult) {
      return {
        kind: 'offer',
        message: res.terminalResult.message,
        slots: res.terminalResult.slots,
      };
    }
    const text = res.finalText?.trim();
    if (text) {
      return { kind: 'question', message: text };
    }
    throw new Error('slot conversation ended without an offer or a question');
  }

  /**
   * Terminal tool: the model's own computed picks, validated LIVE against the
   * REAL blocks only — the week window, one-session-per-day, busy calendar,
   * and hard windows. Preferred training windows are soft (prompt-level) and
   * deliberately NOT enforced here, so any genuinely free hour the athlete
   * asks for is offerable. Failures bounce with the exact reason.
   */
  private offerSlotsTool(
    req: SlotConversationRequest,
    constraints: WeekConstraints,
  ): AnyAgentTool {
    return defineTool<OfferSlotsArgs, { message: string; slots: SlotCandidate[] }>({
      name: 'offer_slots',
      description:
        'Offer 1–3 time slots you computed, with a short chat message. Every ' +
        'pick is validated live against the real calendar blocks and bounced ' +
        'with the reason if not genuinely free. Terminal: ends the turn; the ' +
        'picks render as buttons.',
      schema: offerSlotsSchema,
      terminal: true,
      handler: (args) => {
        const slots: SlotCandidate[] = [];
        for (const pick of args.picks) {
          const validated = this.validatePick(pick, req, constraints);
          if (
            !slots.some((s) => s.scheduledStartUtc === validated.scheduledStartUtc)
          ) {
            slots.push(validated);
          }
        }
        return Promise.resolve({ message: args.message, slots });
      },
    });
  }

  /**
   * Non-terminal tool: persist an explicitly stated, durable scheduling
   * preference into the personalization log (standing or one_off), so future
   * weeks start from it.
   */
  private saveTimePreferenceTool(): AnyAgentTool {
    return defineTool<SaveTimePreferenceArgs, { saved: true }>({
      name: 'save_time_preference',
      description:
        'Record an EXPLICIT scheduling preference the athlete just stated ' +
        '("I generally prefer evenings", "never before 8", "this week only ' +
        'mornings") so future planning starts from it. Not for one-time picks.',
      schema: saveTimePreferenceSchema,
      terminal: false,
      handler: async (args, c) => {
        const item: PreferenceItemDto = {
          eventDate: new Date().toISOString().slice(0, 10),
          scope: 'global',
          durability: args.durability,
          tag: {
            type:
              args.kind === 'preferred'
                ? 'time_window_preferred'
                : 'time_window_blocked',
            value: args.summary,
            polarity: args.kind === 'preferred' ? 'prefer' : 'avoid',
            confidence: 'explicit',
          },
          rawText: args.rawText,
        } as PreferenceItemDto;
        await this.commandBus.execute(
          new CaptureAssistantPreferenceCommand(c.userId, item),
        );
        return { saved: true };
      },
    });
  }

  /** Validate one pick live against the REAL blocks; throw (bounce) if unfree. */
  private validatePick(
    pick: { scheduledDate: string; startTime: string },
    req: SlotConversationRequest,
    constraints: WeekConstraints,
  ): SlotCandidate {
    const startTime = normalizeHhMm(pick.startTime);
    if (startTime === null) {
      throw new Error(
        `Pick start time "${pick.startTime}" is not a valid HH:mm.`,
      );
    }
    const label = `${pick.scheduledDate} ${startTime}`;
    if (
      pick.scheduledDate < req.weekWindow.from ||
      pick.scheduledDate > req.weekWindow.to
    ) {
      throw new Error(`Pick ${label} is outside the target week.`);
    }
    if ((req.takenDates ?? []).includes(pick.scheduledDate)) {
      throw new Error(
        `Pick ${label} is on a day that already has a scheduled session ` +
          '(one session per day). Offer a different day.',
      );
    }
    const startMin = hhMmToMinutes(startTime);
    const endMin = startMin + req.session.durationMin;
    if (endMin > 24 * 60) {
      throw new Error(`Pick ${label} runs past midnight.`);
    }
    const endTime = minutesToHhMm(endMin);
    const scheduledStartUtc = toUtcInstant(
      pick.scheduledDate,
      startTime,
      req.timezone,
    );
    const violations = validatePlacement({
      placed: [
        {
          plannedSessionId: 'candidate',
          scheduledDate: pick.scheduledDate,
          startTime,
          endTime,
          scheduledStartUtc,
        },
      ],
      busy: constraints.busy,
      hardBlocked: constraints.hardBlocked,
    });
    if (violations.length > 0) {
      throw new Error(`Pick ${label} clashes: ${violations.join(' ')}`);
    }
    return {
      scheduledDate: pick.scheduledDate,
      startTime,
      endTime,
      scheduledStartUtc,
    };
  }

  /**
   * The slot conversation's curated seed: the RAW data, each section labelled
   * with what it means (real block vs. soft preference). No precomputed
   * options — the model reasons over this itself.
   */
  private buildSlotSeed(
    req: SlotConversationRequest,
    constraints: WeekConstraints,
  ): string {
    const preferred =
      constraints.availability
        .map((a) => `- ${a.day} ${a.start}–${a.end}`)
        .join('\n') || '- (none on profile)';
    const busy =
      constraints.busy
        .map(
          (b) =>
            `- ${renderLocal(b.startUtc, req.timezone)} → ` +
            `${renderLocal(b.endUtc, req.timezone)} (local)`,
        )
        .join('\n') || '- (calendar completely free / not connected)';
    const hard =
      constraints.hardBlocked
        .map((h) => `- ${h.day} ${h.start}–${h.end}`)
        .join('\n') || '- (none)';

    const latest = req.userMessage.trim();
    return [
      `== SESSION TO SCHEDULE ==`,
      `- title: "${req.session.title}"`,
      `- duration: ${req.session.durationMin} min`,
      `- soft day hint: ${req.session.preferredDate ?? '(none)'}`,
      ``,
      `== WEEK ==`,
      `- window: ${req.weekWindow.from}..${req.weekWindow.to} (local, inclusive)`,
      `- timezone: ${req.timezone} (all times below are local unless marked)`,
      ``,
      `== BUSY CALENDAR — real events; never overlap (the only true conflicts) ==`,
      busy,
      ``,
      `== HARD BLOCKED WINDOWS — absolute no-book zones ==`,
      hard,
      ``,
      `== DAYS ALREADY TAKEN — already hold a session; one per day, never offer ==`,
      (req.takenDates ?? []).map((d) => `- ${d}`).join('\n') || '- (none yet)',
      ``,
      `== PREFERRED TRAINING WINDOWS — soft; default here, but any free hour ` +
        `the athlete explicitly asks for is bookable ==`,
      preferred,
      ``,
      `== ATHLETE'S LATEST MESSAGE ==`,
      latest ? `"${latest}"` : '(none — this is your opening turn for this session)',
      ``,
      `== TASK ==`,
      `Think through the free times yourself. Then either call offer_slots ` +
        `with 1–3 options (any minute of the hour is allowed), or reply with ` +
        `ONE short question if you truly need their preference first. If they ` +
        `stated a durable preference, save_time_preference first.`,
    ].join('\n');
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

  /**
   * Live busy intervals for the target week from the user's Google Calendar.
   * A user WITHOUT a connected calendar is not an error — there is simply
   * nothing to clash against, so proposals fall back to availability alone.
   * A transient Google failure still throws (the caller surfaces a retry).
   */
  private async fetchBusy(
    userId: string,
    window: { from: string; to: string },
  ): Promise<BusyInterval[]> {
    try {
      const events = await this.calendar.listEvents(userId, {
        fromUtc: `${window.from}T00:00:00.000Z`,
        toUtc: `${window.to}T23:59:59.999Z`,
      });
      return events
        .filter((e) => e.busy && !e.appOwned)
        .map((e) => ({ startUtc: e.start, endUtc: e.end }));
    } catch (err) {
      if (err instanceof NotFoundException) {
        this.logger.warn(
          `fetchBusy: no Google Calendar connected for ${userId}; proposing from availability only.`,
        );
        return [];
      }
      throw err;
    }
  }
}
