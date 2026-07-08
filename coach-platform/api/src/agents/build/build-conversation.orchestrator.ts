import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import {
  AppendMessageCommand,
  AppendMessageResult,
} from '../conversation/application/commands/append-message.command';
import { SetPendingCardBatchCommand } from '../conversation/application/commands/set-pending-card-batch.command';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
} from '../conversation/domain/conversation.repository.port';
import { MessageMeta } from '../conversation/domain/conversation.model';
import { GetActiveProgramQuery } from '../../program/application/queries/get-active-program.query';
import { ActiveProgramResponse } from '../../program/application/dto/program.response';
import { ProgramWeek } from '../../program/domain/program.model';
import {
  CommitSkeletonCommand,
  CommitSkeletonResult,
} from '../../program/application/commands/commit-skeleton.command';
import { GetWeekQuery } from '../../planned-sessions/application/queries/get-week.query';
import { PlannedSessionResponse } from '../../planned-sessions/application/dto/planned-session.response';
import {
  UpsertSessionScheduleCommand,
  UpsertSessionScheduleResult,
} from '../../planned-sessions/application/commands/upsert-session-schedule.command';
import { GetUserQuery } from '../../users/application/queries/get-user.query';
import { UserResponse } from '../../users/application/dto/user.response';
import { GetTrainingProfileQuery } from '../../training/application/queries/get-training-profile.query';
import {
  TrainingProfileResponse,
  TrainingProfileStatusResponse,
} from '../../training/application/dto/training-profile.response';
import { CoachService } from '../coach/coach.service';
import { PlannerService } from '../planner/planner.service';
import {
  CalendarSyncService,
  SyncableSession,
} from '../approval/calendar-sync.service';
import {
  hasSlotWish,
  matchesSlotWish,
  parseSlotWish,
  resolveRelativeWish,
  SlotCandidate,
} from './slot-proposer';
import { PendingCardBatchService } from '../approval/pending-card-batch.service';
import { AgentTelemetryService } from '../shared/llm/agent-telemetry.service';
import { computeAdherence } from '../shared/read-tools/aggregates';
import {
  BuildPhase,
  BuildSnapshot,
  isSessionScheduled,
  isWeekBuildComplete,
  resolveBuildPhase,
} from './build-phase.resolver';

/** The outcome of a build-conversation turn the orchestrator handled itself. */
export interface BuildTurnResult {
  /** The user-facing assistant reply persisted this turn. */
  reply: string;
  /** The persisted assistant message id. */
  assistantMessageId: string;
  /** True when the turn ended awaiting the user's decision (consent gate). */
  awaitingConfirmation: boolean;
  /**
   * The approval card this turn opened, when the turn's decision is owned by a
   * card rather than a yes/no consent gate. Lets the client render the card
   * immediately off the turn response, without waiting for a conversation
   * refetch. Null when no card was opened this turn.
   */
  pendingCardBatchId: string | null;
}

/** Fallback copy when a Coach run produces no usable text. */
const FALLBACK_PROPOSAL =
  "I've sketched your first week. Take a look on your program page — does this " +
  'look like a good starting point, or would you like to adjust anything?';
const FALLBACK_LOCK_CONFIRM =
  "That's step one done — your week's goals are locked in. Nice work getting " +
  "aligned. Now for the fun part: I'll draft your sessions one at a time, and " +
  'you get the final say on each.';
const FALLBACK_COACH_UNAVAILABLE =
  "Sorry — I couldn't reach your coach just now. Reply and I'll try again.";
const FALLBACK_SESSION_DRAFT =
  "I've drafted your next session — take a look at the card and let me know if " +
  'it looks good to add, or tell me what to change.';
/** Posted once every session is committed; BW3 takes over for scheduling. */
const SESSIONS_COMPLETE_HANDOFF =
  "Amazing — that's every session for the week drafted and approved. Your week " +
  "has real shape now. One last step: let's find a time on your calendar for " +
  'each session.';
/** Posted when the live calendar couldn't be read while proposing slots. */
const CALENDAR_UNAVAILABLE =
  "I couldn't check your calendar just now — that's on the calendar service, " +
  "not you. Reply (or hit retry) and I'll look again.";
/** Posted when the schedule saved but the Google event write failed. */
const CALENDAR_WRITE_FAILED =
  "I've saved that time for the session, but I couldn't add it to your Google " +
  "Calendar just now — I'll sync it later, no action needed.";
/** Posted when no clash-free calendar slot exists for the session being placed. */
const NO_SLOTS_AVAILABLE =
  "I couldn't find a free, clash-free time for this session in your calendar " +
  'this week. Free up a window (or adjust your availability) and reply, and ' +
  "I'll look again.";
/**
 * Posted once per week, before the first slot proposal: general recurring
 * availability was already covered at onboarding, but this week specifically
 * may differ (a one-off conflict, a day that works better). One round only —
 * a check-in, not a full interview.
 */
const WEEK_SCHEDULE_CHECKIN =
  'Before I start finding times this week — anything different about your ' +
  "schedule, like a one-off conflict or a day that works better than usual? " +
  "Let me know, or just say no and I'll go ahead.";
/** Posted right after a session card is approved, before the next step runs. */
const SESSION_APPROVED_ACK =
  "Nice — that session's locked in and added to your week.";
/**
 * Posted when a session card is declined without any stated reason. Opens the
 * revision interview deterministically (no LLM guessing at what to change);
 * `{title}` is replaced with the declined session's title when known.
 */
const SESSION_DECLINED_ASK =
  'I saw you passed on {title}. Tell me what you\'d like different — the type ' +
  "of session, its structure, the day it lands on, anything — and I'll redraft it.";
/** Posted once every session is scheduled and the week is locked. */
const BUILD_COMPLETE =
  "That's it — your week is fully built and every session is on your calendar. " +
  'We planned it together, so go make it count. You can review the full week on ' +
  'your program page any time.';

/**
 * Routes turns on a `program_build` conversation through the build state
 * machine. Deterministic choreography: it resolves the live phase
 * ({@link resolveBuildPhase}) and dispatches the matching Coach action with a
 * human-in-the-loop gate between phases. The phase is derived from program /
 * week / session state every turn, so a returning user resumes correctly with
 * no stored step pointer.
 *
 * BW1 implements the TARGETS phases (propose → consent → lock). DRAFT_SESSION /
 * slot phases are added by BW2/BW3; until then a turn in those phases returns
 * null so the caller falls back to the ordinary assistant.
 */
@Injectable()
export class BuildConversationOrchestrator {
  private readonly logger = new Logger(BuildConversationOrchestrator.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly coach: CoachService,
    private readonly planner: PlannerService,
    private readonly calendarSync: CalendarSyncService,
    private readonly telemetry: AgentTelemetryService,
    private readonly batches: PendingCardBatchService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepositoryPort,
  ) {}

  /**
   * Kick off a fresh build inside an already-created `program_build`
   * conversation: post a "building…" placeholder, lay down the periodization
   * skeleton, propose week-1 targets, and post the proposal as the first real
   * assistant message. Surfaces the chat over SSE so the UI can navigate to it.
   */
  async startBuild(args: {
    userId: string;
    conversationId: string;
    title: string | null;
    programId: string;
    discipline: EventDiscipline;
    weekIndex: number;
  }): Promise<void> {
    const { userId, conversationId, title, programId, discipline, weekIndex } =
      args;

    // Surface the opened chat immediately so the FE can land the user in it
    // while Step A runs (the "coach is thinking" state).
    this.telemetry.emitConversationOpened({
      userId,
      conversationId,
      title,
      origin: 'system',
      attention: true,
    });

    try {
      const runId = `build:propose:${userId}:${programId}:${randomUUID()}`;
      // Warm welcome before any proposal: the app-welcome for the very first
      // build (weekIndex 0, onboarding), or a "welcome to week N" recap of the
      // prior week for every later scheduled build. Best-effort — a failure
      // here shouldn't block the actual build kickoff.
      await this.postWelcome(userId, conversationId, programId, weekIndex, discipline);
      // Lay down the skeleton only the first time — a bare seed has just the
      // one placeholder week. Every later week's build reuses the existing
      // skeleton (regenerating it would wipe already-locked weeks' state; see
      // commitSkeletonTool) and just proposes targets, like a regular week.
      const active = await this.queryBus.execute<
        GetActiveProgramQuery,
        ActiveProgramResponse
      >(new GetActiveProgramQuery(userId));
      if ((active.program?.weeks.length ?? 0) <= 1) {
        await this.coach.generateProgram(userId, runId, discipline);
      }
      const proposal = await this.coach.proposeWeeklyTargets(
        userId,
        runId,
        discipline,
        { weekIndex, conversationId, openWithInterview: true },
      );
      const outcome = this.proposalOutcome(proposal);
      await this.append(userId, conversationId, outcome.text, {
        awaitingConfirmation: outcome.awaitingConfirmation,
      });
    } catch (err) {
      this.logger.error(
        `Build kickoff failed for ${userId} (program ${programId}): ${String(err)}`,
      );
      await this.append(userId, conversationId, FALLBACK_COACH_UNAVAILABLE, {
        awaitingConfirmation: true,
        buildRetry: true,
      });
    }
  }

  /**
   * Handle one user turn on a build conversation. Returns a {@link BuildTurnResult}
   * when the orchestrator acted, or `null` when the current phase isn't handled
   * yet (caller should fall back to the ordinary assistant turn).
   */
  async handleTurn(args: {
    userId: string;
    conversationId: string;
    message: string;
    discipline: EventDiscipline;
  }): Promise<BuildTurnResult | null> {
    const { userId, conversationId, message, discipline } = args;
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    const buildContext = convo?.buildContext ?? null;
    if (!buildContext) {
      return null;
    }

    const load = await this.loadBuild(
      userId,
      conversationId,
      buildContext.programId,
      buildContext.weekIndex,
      convo?.pendingCardBatchId ?? null,
    );
    if (!load) {
      return null;
    }
    const { snapshot, sessions } = load;

    const phase = resolveBuildPhase(snapshot);
    this.logger.log(
      `build turn: conversation=${conversationId} phase=${phase}`,
    );

    switch (phase) {
      case 'PROPOSE_TARGETS':
        return this.runPropose(userId, conversationId, discipline, buildContext.weekIndex);
      case 'AWAIT_TARGETS_CONSENT':
        return this.runTargetsConsent(
          userId,
          conversationId,
          discipline,
          snapshot.week,
          buildContext.programId,
          message,
        );
      case 'DRAFT_SESSION':
        // The user's reply mid-interview (or after a declined card) is the
        // controlling input for the draft — pass it through so the coach
        // honors it rather than re-deriving everything from history alone.
        return this.runDraftSession(
          userId,
          conversationId,
          discipline,
          buildContext.programId,
          snapshot,
          sessions,
          message,
        );
      case 'AWAIT_SESSION_CONSENT':
        // A reply while a session card is open is an adjustment request: re-draft
        // the session (superseding the open card). Explicit approval is the card
        // button, which commits + advances via the approval flow.
        return this.runDraftSession(
          userId,
          conversationId,
          discipline,
          buildContext.programId,
          snapshot,
          sessions,
          message,
        );
      case 'PROPOSE_SLOTS':
        // No proposal on the table yet → compute + offer slots for the next
        // unscheduled session, honoring any day/time wish in the message.
        return this.runProposeSlots(userId, conversationId, snapshot, sessions, message);
      case 'AWAIT_SLOT_CONSENT':
        // A free-text reply while slots are on the table: parse it — a named
        // day/time filters the candidates; anything else means "none of these",
        // so offer different ones. The actual pick comes through confirmSlot.
        return this.runProposeSlots(userId, conversationId, snapshot, sessions, message);
      case 'COMPLETE':
        // Everything is scheduled; flip the week to locked (if needed) and
        // confirm. Idempotent — a locked week just re-confirms.
        return this.runComplete(
          userId,
          conversationId,
          buildContext.programId,
          snapshot,
        );
      default:
        return null;
    }
  }

  /**
   * Advance the build after a session card is approved (called by the approval
   * flow once the session is committed). Re-resolves the phase from fresh state:
   * if more sessions remain → draft + card the next; if all are committed → post
   * the scheduling hand-off. Returns the posted reply text (or null if nothing
   * was posted, e.g. a stale/no-longer-build conversation).
   */
  async advanceAfterSessionApproved(
    userId: string,
    conversationId: string,
    approvedTitle?: string | null,
  ): Promise<string | null> {
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    const buildContext = convo?.buildContext ?? null;
    if (!buildContext) {
      return null;
    }
    // The approved card's batch is terminal now; clear the conversation pointer
    // so the snapshot sees no outstanding gate and the resolver can advance.
    await this.clearPendingBatch(userId, conversationId);

    const load = await this.loadBuild(
      userId,
      conversationId,
      buildContext.programId,
      buildContext.weekIndex,
      null,
    );
    if (!load) {
      return null;
    }
    const { snapshot, sessions } = load;
    const discipline = await this.resolveDiscipline(userId);
    const phase = resolveBuildPhase(snapshot);
    this.logger.log(
      `build advance: conversation=${conversationId} phase=${phase}`,
    );

    // Record the approval in the transcript. The card decision happens
    // out-of-band (POST /approvals), so without this the conversation history
    // the LLM sees would jump from "does this look good?" straight to the next
    // draft with no trace of the user's decision. Personalized with the
    // approved session's title when the approval flow passes it along.
    const ack = approvedTitle
      ? `Nice — "${approvedTitle}" is locked in and added to your week.`
      : SESSION_APPROVED_ACK;
    await this.append(userId, conversationId, ack, {
      awaitingConfirmation: false,
    });

    if (phase === 'DRAFT_SESSION') {
      const res = await this.runDraftSession(
        userId,
        conversationId,
        discipline,
        buildContext.programId,
        snapshot,
        sessions,
      );
      return res.reply;
    }
    // Every session committed — post the scheduling hand-off, then immediately
    // offer the first slot so the chat moves straight into scheduling.
    await this.append(userId, conversationId, SESSIONS_COMPLETE_HANDOFF, {
      awaitingConfirmation: false,
    });
    const slots = await this.runProposeSlots(
      userId,
      conversationId,
      snapshot,
      sessions,
    );
    return slots.reply;
  }

  /**
   * Reopen a discussion after a session card is rejected (called by the approval
   * flow once the batch is marked `rejected`). Rejecting a drafted session is
   * never a dead end. With `feedback`, the coach redrafts through the same
   * interview-aware path as a free-text adjustment. WITHOUT feedback (the card's
   * Decline button), no LLM run fires at all: we post a deterministic
   * acknowledgment — "I saw you passed on X, tell me what you'd like different" —
   * and wait for the user's answer, which re-enters DRAFT_SESSION as the
   * adjustment. This both records the rejection in the transcript (so the LLM's
   * history shows the decision) and guarantees the clarifying question is asked
   * exactly once instead of hoping the model asks it. Returns the posted reply
   * text (or null if nothing was posted, e.g. a stale conversation).
   */
  async openSessionRevision(
    userId: string,
    conversationId: string,
    feedback?: string,
  ): Promise<string | null> {
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    const buildContext = convo?.buildContext ?? null;
    if (!buildContext) {
      return null;
    }
    // The rejected card's batch is terminal now; clear the conversation pointer
    // so the snapshot sees no outstanding gate and the resolver re-drafts.
    await this.clearPendingBatch(userId, conversationId);

    const load = await this.loadBuild(
      userId,
      conversationId,
      buildContext.programId,
      buildContext.weekIndex,
      null,
    );
    if (!load) {
      return null;
    }
    const { snapshot, sessions } = load;
    const trimmed = feedback?.trim() ?? '';

    if (trimmed) {
      const discipline = await this.resolveDiscipline(userId);
      const res = await this.runDraftSession(
        userId,
        conversationId,
        discipline,
        buildContext.programId,
        snapshot,
        sessions,
        trimmed,
      );
      return res.reply;
    }

    // Decline with no stated reason — acknowledge + open the revision
    // interview. LLM-composed with the conversation history (so it sounds like
    // Popvich, and can lead with a best guess at why); the deterministic copy
    // remains as fallback so the clarifying question is ALWAYS asked.
    const declined = sessions.find((s) => s.planState === 'tentative');
    const fallbackAsk = SESSION_DECLINED_ASK.replace(
      '{title}',
      declined ? `"${declined.title}"` : 'that session',
    );
    let ask: string | null = null;
    try {
      const discipline = await this.resolveDiscipline(userId);
      ask = await this.coach.composeDeclineAsk(
        userId,
        `build:decline:${userId}:${randomUUID()}`,
        discipline,
        { conversationId, declinedTitle: declined?.title ?? null },
      );
    } catch (err) {
      this.logger.warn(`composeDeclineAsk failed for ${userId}: ${String(err)}`);
    }
    const text = ask ?? fallbackAsk;
    await this.append(userId, conversationId, text, {
      awaitingConfirmation: false,
    });
    return text;
  }

  /**
   * BW4 — re-greet a build on reopen. The phase is always derived from live
   * program / week / session state (no stored pointer), so resume is free: if the
   * conversation already ends at the current phase's consent gate (an `AWAIT_*`
   * phase), this is a no-op. Only when the build sits on an UNPERFORMED action
   * phase — a kickoff that aborted, or a step whose message was never posted — do
   * we re-run that action so the chat never dead-ends. Idempotent: drafting picks
   * the next uncommitted slot and slot proposals recompute, so a resume never
   * double-writes. Returns the posted reply, or null when nothing was needed.
   */
  async resumeBuild(
    userId: string,
    conversationId: string,
  ): Promise<BuildTurnResult | null> {
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    const buildContext = convo?.buildContext ?? null;
    if (!buildContext) {
      return null;
    }
    const load = await this.loadBuild(
      userId,
      conversationId,
      buildContext.programId,
      buildContext.weekIndex,
      convo?.pendingCardBatchId ?? null,
    );
    if (!load) {
      return null;
    }
    const { snapshot, sessions } = load;
    const phase = resolveBuildPhase(snapshot);
    this.logger.log(
      `build resume: conversation=${conversationId} phase=${phase}`,
    );

    let result: BuildTurnResult | null;
    switch (phase) {
      case 'PROPOSE_TARGETS': {
        const discipline = await this.resolveDiscipline(userId);
        result = await this.runPropose(
          userId,
          conversationId,
          discipline,
          buildContext.weekIndex,
        );
        break;
      }
      case 'DRAFT_SESSION': {
        const discipline = await this.resolveDiscipline(userId);
        result = await this.runDraftSession(
          userId,
          conversationId,
          discipline,
          buildContext.programId,
          snapshot,
          sessions,
        );
        break;
      }
      case 'PROPOSE_SLOTS':
        result = await this.runProposeSlots(
          userId,
          conversationId,
          snapshot,
          sessions,
        );
        break;
      case 'COMPLETE':
        result = await this.runComplete(
          userId,
          conversationId,
          buildContext.programId,
          snapshot,
        );
        break;
      default:
        // AWAIT_TARGETS_CONSENT / AWAIT_SESSION_CONSENT / AWAIT_SLOT_CONSENT —
        // the gate message is already in the transcript; resume is free.
        return null;
    }

    // Re-surface the chat (pinned + flagged) so a returning user is drawn back
    // into the in-flight build (decision 12 — reuse attention).
    this.telemetry.emitConversationOpened({
      userId,
      conversationId,
      title: convo?.title ?? null,
      origin: 'system',
      attention: true,
    });
    return result;
  }

  // ── phase handlers ──────────────────────────────────────────────────────

  /** (Re)propose week targets — used if a turn arrives before a proposal exists. */
  private async runPropose(
    userId: string,
    conversationId: string,
    discipline: EventDiscipline,
    weekIndex: number,
  ): Promise<BuildTurnResult> {
    const runId = `build:propose:${userId}:${randomUUID()}`;
    try {
      const proposal = await this.coach.proposeWeeklyTargets(
        userId,
        runId,
        discipline,
        { weekIndex, conversationId },
      );
      const outcome = this.proposalOutcome(proposal);
      return this.handled(
        userId,
        conversationId,
        outcome.text,
        outcome.awaitingConfirmation,
      );
    } catch (err) {
      this.logger.error(`runPropose failed for ${userId}: ${String(err)}`);
      return this.failed(userId, conversationId, FALLBACK_COACH_UNAVAILABLE);
    }
  }

  /** Interpret the user's reply to a targets proposal: lock or re-propose. */
  private async runTargetsConsent(
    userId: string,
    conversationId: string,
    discipline: EventDiscipline,
    week: ProgramWeek,
    programId: string,
    message: string,
  ): Promise<BuildTurnResult> {
    const targets = week.weeklyTargets;
    if (!targets) {
      // Shouldn't happen (resolver guarantees a proposal here) — re-propose.
      return this.runPropose(userId, conversationId, discipline, week.weekIndex);
    }

    const runId = `build:consent:${userId}:${randomUUID()}`;
    try {
      const res = await this.coach.resolveTargetsConsent(userId, runId, discipline, {
        weekIndex: week.weekIndex,
        proposed: {
          sessionCount: targets.sessionCount,
          totalVolume: targets.totalVolume,
          keyGoals: targets.keyGoals,
        },
        userMessage: message,
        conversationId,
      });

      if (res.terminalTool === 'lock_weekly_targets') {
        // Locked. Confirm, then immediately draft the first session in the same
        // turn so the build moves straight on without waiting for another user
        // message (mirrors advanceAfterSessionApproved — a passed gate always
        // auto-continues to the next step).
        await this.append(userId, conversationId, FALLBACK_LOCK_CONFIRM, {
          awaitingConfirmation: false,
        });
        return this.continueAfterTargetsLocked(
          userId,
          conversationId,
          discipline,
          programId,
          week.weekIndex,
        );
      }

      // Re-proposed OR an interview question. Only an actual re-proposal
      // (terminal propose tool) re-opens the consent gate — a question awaits
      // a free-text answer and must not render an approval box.
      const outcome = this.proposalOutcome(res);
      return this.handled(
        userId,
        conversationId,
        outcome.text,
        outcome.awaitingConfirmation,
      );
    } catch (err) {
      this.logger.error(`runTargetsConsent failed for ${userId}: ${String(err)}`);
      return this.failed(userId, conversationId, FALLBACK_COACH_UNAVAILABLE);
    }
  }

  /**
   * Continue the build immediately after the week's targets are locked: re-load
   * fresh state (the week is now `targets_locked`) and draft the first session,
   * so locking targets flows straight into the first session card without the
   * user having to send another message. Mirrors {@link advanceAfterSessionApproved}.
   */
  private async continueAfterTargetsLocked(
    userId: string,
    conversationId: string,
    discipline: EventDiscipline,
    programId: string,
    weekIndex: number,
  ): Promise<BuildTurnResult> {
    const load = await this.loadBuild(
      userId,
      conversationId,
      programId,
      weekIndex,
      null,
    );
    if (!load) {
      // Couldn't reload — the lock confirmation is already posted; surface a
      // recoverable failure so a reply re-runs the (now DRAFT_SESSION) phase.
      return this.failed(userId, conversationId, FALLBACK_COACH_UNAVAILABLE);
    }
    const { snapshot, sessions } = load;
    const phase = resolveBuildPhase(snapshot);
    this.logger.log(
      `targets-locked advance: conversation=${conversationId} phase=${phase}`,
    );
    if (phase === 'DRAFT_SESSION') {
      // First session of the week — open its step with the interview (nothing
      // session-level has been discussed yet), per the build's interview-first
      // doctrine. Later sessions inherit the established pattern.
      return this.runDraftSession(
        userId,
        conversationId,
        discipline,
        programId,
        snapshot,
        sessions,
        undefined,
        true,
      );
    }
    // Defensive: a zero-session quota (or already-committed sessions) leaves
    // nothing to draft — move straight to scheduling.
    return this.runProposeSlots(userId, conversationId, snapshot, sessions);
  }

  /**
   * Draft (or re-draft) the next session and open a 1-session card for it. The
   * Coach writes exactly one tentative session bounded by the locked targets +
   * already-committed sessions; we then record a `build_session` card batch tied
   * to this conversation (superseding any open one) and post the coach's message.
   * `adjustment`, when present, is the user's requested change to re-draft around.
   */
  private async runDraftSession(
    userId: string,
    conversationId: string,
    discipline: EventDiscipline,
    programId: string,
    snapshot: BuildSnapshot,
    sessions: PlannedSessionResponse[],
    adjustment?: string,
    openWithInterview = false,
  ): Promise<BuildTurnResult> {
    const targets = snapshot.week.weeklyTargets;
    if (!targets) {
      // Resolver guarantees locked targets here; be defensive.
      return this.handled(userId, conversationId, FALLBACK_COACH_UNAVAILABLE, false);
    }

    const committed = sessions.filter((s) => s.planState === 'committed');
    const timezone = await this.resolveTimezone(userId);
    const runId = `build:draft:${userId}:${randomUUID()}`;

    try {
      const res = await this.coach.draftNextSession(userId, runId, discipline, {
        programId,
        weekIndex: snapshot.week.weekIndex,
        weekStartDate: snapshot.week.startDate,
        timezone,
        targets: {
          sessionCount: targets.sessionCount,
          totalVolume: targets.totalVolume,
          keyGoals: targets.keyGoals,
        },
        committed,
        committedSlotKeys: committed.map((s) => s.slotKey),
        conversationId,
        adjustment,
        openWithInterview,
      });

      // Interview-first: the coach may ask a clarifying question instead of
      // drafting (no terminal write). In that case no session was written, so
      // don't open a card — just post the question and stay in DRAFT_SESSION
      // awaiting the answer (the next reply re-enters this handler).
      if (res.terminalTool !== 'draft_next_session') {
        const question = res.finalText?.trim();
        if (question) {
          // An interview question awaits a typed answer — no consent gate, so
          // the UI must not render the Approve/Cancel box under it.
          return this.handled(userId, conversationId, question, false);
        }
        return this.failed(userId, conversationId, FALLBACK_COACH_UNAVAILABLE);
      }

      // Open / refresh the per-session card and link it to this conversation.
      const batch = await this.batches.record({
        userId,
        programId,
        weekIndex: snapshot.week.weekIndex,
        kind: 'build_session',
        runId,
        conversationId,
      });
      await this.commandBus.execute(
        new SetPendingCardBatchCommand(userId, conversationId, batch.id),
      );

      const text = res.finalText?.trim() || FALLBACK_SESSION_DRAFT;
      // A drafted session's decision is owned by its card, NOT a yes/no consent
      // gate — so it does not raise `awaitingConfirmation`. It advertises the
      // card id so the client can render the card straight off this response.
      return this.handled(userId, conversationId, text, false, batch.id);
    } catch (err) {
      this.logger.error(`runDraftSession failed for ${userId}: ${String(err)}`);
      return this.failed(userId, conversationId, FALLBACK_COACH_UNAVAILABLE);
    }
  }

  /**
   * Find a calendar time for the next committed-but-unscheduled session,
   * LLM-first: the Planner's slot conversation sees the session, availability,
   * live calendar, the VALIDATED candidate pool (the only offerable times), and
   * the chat history — then either offers 1–3 picks (posted with
   * `meta.slotProposal` so the UI renders pickable chips) or asks one interview
   * question in plain text. When the pool is empty it posts a "free up a
   * window" prompt.
   *
   * If the LLM turn fails, a deterministic fallback reads `userMessage` itself:
   * a named day / time of day / clock time / "later" / "earlier" filters the
   * candidates toward the wish; any other non-empty reply while a proposal is
   * outstanding means "none of these", so previously offered start instants are
   * excluded and different options are shown.
   */
  private async runProposeSlots(
    userId: string,
    conversationId: string,
    snapshot: BuildSnapshot,
    sessions: PlannedSessionResponse[],
    userMessage?: string,
  ): Promise<BuildTurnResult> {
    const next = sessions.find(
      (s) => s.planState === 'committed' && !isSessionScheduled(s),
    );
    if (!next) {
      // Nothing left to place — flip to complete.
      return this.runComplete(
        userId,
        conversationId,
        sessions[0]?.programId ?? '',
        snapshot,
      );
    }

    // One-round check-in before the week's FIRST slot proposal: onboarding
    // already captured general recurring availability, but this specific week
    // may differ. Fires once per week (detected from history), not once per
    // session — later sessions in the same week skip straight to candidates.
    if (!(await this.hasWeekCheckin(userId, conversationId))) {
      // A free-text check-in question, not a consent gate — the user answers by
      // typing (or "no"), so no Approve/Cancel box may render under it.
      const assistantMessageId = await this.append(
        userId,
        conversationId,
        WEEK_SCHEDULE_CHECKIN,
        { awaitingConfirmation: false, weekCheckin: true },
      );
      return {
        reply: WEEK_SCHEDULE_CHECKIN,
        assistantMessageId,
        awaitingConfirmation: false,
        pendingCardBatchId: null,
      };
    }

    const week = snapshot.week;
    const timezone = next.timezone || (await this.resolveTimezone(userId));
    // One session per day: days already holding a scheduled session this week
    // are excluded from the candidate pool entirely.
    const takenDates = [
      ...new Set(
        sessions
          .filter((s) => isSessionScheduled(s) && s.scheduledDate)
          .map((s) => s.scheduledDate),
      ),
    ];

    // LLM-led turn: the model sees the session, availability, live calendar,
    // the validated candidate pool, and the chat — and decides whether to offer
    // picks (terminal tool, pool-only) or ask an interview question first. Any
    // LLM failure falls back to the deterministic wish/exclude path below.
    try {
      const outcome = await this.planner.converseSlot(userId, randomUUID(), {
        conversationId,
        userMessage: userMessage?.trim() ?? '',
        session: {
          id: next.id,
          title: next.title,
          durationMin: next.estDurationMin,
          preferredDate: next.scheduledDate,
        },
        weekWindow: { from: week.startDate, to: week.endDate },
        timezone,
        takenDates,
      });
      if (outcome.kind === 'question') {
        // An interview/clarifying question — the user answers by typing.
        return this.handled(userId, conversationId, outcome.message, false);
      }
      const assistantMessageId = await this.append(
        userId,
        conversationId,
        outcome.message,
        {
          awaitingConfirmation: true,
          slotProposal: {
            plannedSessionId: next.id,
            candidates: outcome.slots.map((c) => ({
              scheduledDate: c.scheduledDate,
              startTime: c.startTime,
              endTime: c.endTime,
              scheduledStartUtc: c.scheduledStartUtc,
            })),
          },
        },
      );
      return {
        reply: outcome.message,
        assistantMessageId,
        awaitingConfirmation: true,
        pendingCardBatchId: null,
      };
    } catch (err) {
      this.logger.warn(
        `converseSlot failed for ${userId}; falling back to deterministic ` +
          `slot proposal: ${String(err)}`,
      );
    }

    try {
      // Deterministic fallback — reading of the user's reply: named day /
      // time-of-day / clock time / "later" / "earlier" → a wish to honor; any
      // other non-empty reply → "none of these", so exclude what was offered.
      const trimmedMessage = userMessage?.trim() ?? '';
      const prior = trimmedMessage
        ? await this.latestSlotProposal(userId, conversationId)
        : null;
      const priorForSession =
        prior && prior.plannedSessionId === next.id ? prior : null;
      const wish = resolveRelativeWish(
        parseSlotWish(userMessage),
        priorForSession?.candidates.map((c) => c.startTime) ?? [],
      );
      const wished = hasSlotWish(wish);
      const exclude =
        !wished && trimmedMessage && priorForSession
          ? priorForSession.candidates.map((c) => c.scheduledStartUtc)
          : [];

      // Fetch a wide pool so wish-filtering / exclusion still leaves options.
      const pool = await this.planner.proposeSlotsForSession(userId, {
        weekWindow: { from: week.startDate, to: week.endDate },
        timezone,
        durationMin: next.estDurationMin,
        preferredDate: next.scheduledDate,
        limit: 24,
        exclude,
        excludeDates: takenDates,
      });
      if (pool.length === 0) {
        if (exclude.length > 0) {
          // Everything else inside their availability is taken — the prior
          // options stay pickable (the outstanding proposal is unchanged).
          return this.handled(
            userId,
            conversationId,
            'I can only book inside your usual availability windows, and those ' +
              'are the only clash-free times left in them this week. Pick one of ' +
              'the options above, name a specific day or time, or update your ' +
              "availability and reply — I'll look again.",
            false,
          );
        }
        // "Free up a window and reply" — a typed reply, not a consent decision.
        return this.handled(userId, conversationId, NO_SLOTS_AVAILABLE, false);
      }

      let candidates = pool.slice(0, 3);
      let leadIn =
        `Let's find a time for "${next.title}". Here are a few open slots — ` +
        'pick the one that works:';
      if (wished) {
        const matching = pool.filter((c) => matchesSlotWish(c, wish));
        if (matching.length > 0) {
          candidates = matching.slice(0, 3);
          leadIn = `Sure — here's what's open then for "${next.title}". Pick the one that works:`;
        } else {
          leadIn =
            "I couldn't find a free time matching that inside your usual " +
            'availability windows this week (I only book within them). ' +
            `Here's what is open for "${next.title}" — or update your ` +
            'availability and ask me again:';
        }
      } else if (exclude.length > 0) {
        leadIn = `No problem — here are some other options for "${next.title}":`;
      }

      const text = this.formatSlotProposal(leadIn, candidates);
      const assistantMessageId = await this.append(
        userId,
        conversationId,
        text,
        {
          awaitingConfirmation: true,
          slotProposal: {
            plannedSessionId: next.id,
            candidates: candidates.map((c) => ({
              scheduledDate: c.scheduledDate,
              startTime: c.startTime,
              endTime: c.endTime,
              scheduledStartUtc: c.scheduledStartUtc,
            })),
          },
        },
      );
      return {
        reply: text,
        assistantMessageId,
        awaitingConfirmation: true,
        pendingCardBatchId: null,
      };
    } catch (err) {
      // The only external dependency here is the live calendar read — surface
      // an honest, calendar-specific retry rather than "couldn't reach your coach".
      this.logger.error(`runProposeSlots failed for ${userId}: ${String(err)}`);
      return this.failed(userId, conversationId, CALENDAR_UNAVAILABLE);
    }
  }

  /**
   * Confirm a user's slot pick: re-validate it against the LIVE calendar (a slot
   * can go stale between propose and pick), write the schedule onto the session,
   * create the Google event, then advance — propose the next session's slots, or
   * lock the week if this was the last. A stale pick re-proposes fresh slots.
   * Returns null when the conversation isn't a resolvable build.
   */
  async confirmSlot(
    userId: string,
    conversationId: string,
    scheduledStartUtc: string,
  ): Promise<BuildTurnResult | null> {
    const convo = await this.conversations.findConversation(
      userId,
      conversationId,
    );
    const buildContext = convo?.buildContext ?? null;
    if (!buildContext) {
      return null;
    }
    const load = await this.loadBuild(
      userId,
      conversationId,
      buildContext.programId,
      buildContext.weekIndex,
      convo?.pendingCardBatchId ?? null,
    );
    if (!load) {
      return null;
    }
    const { snapshot, sessions } = load;

    const proposal = await this.latestSlotProposal(userId, conversationId);
    if (!proposal) {
      // No proposal on the table — recompute (resumes correctly post-restart).
      return this.runProposeSlots(userId, conversationId, snapshot, sessions);
    }
    const session = sessions.find((s) => s.id === proposal.plannedSessionId);
    const chosen = proposal.candidates.find(
      (c) => c.scheduledStartUtc === scheduledStartUtc,
    );
    if (!session || !chosen) {
      // The pick doesn't match an open candidate — re-propose to resync.
      return this.runProposeSlots(userId, conversationId, snapshot, sessions);
    }

    const week = snapshot.week;
    const timezone = session.timezone || (await this.resolveTimezone(userId));
    const slot: SlotCandidate = {
      scheduledDate: chosen.scheduledDate,
      startTime: chosen.startTime,
      endTime: chosen.endTime,
      scheduledStartUtc: chosen.scheduledStartUtc,
    };

    // Re-validate against the live calendar; a clash now means the slot went
    // stale, so re-propose a fresh set rather than writing a conflicting event.
    const violations = await this.planner.validateSlot(
      userId,
      { weekWindow: { from: week.startDate, to: week.endDate }, timezone },
      slot,
    );
    if (violations.length > 0) {
      this.logger.log(
        `confirmSlot: stale slot for session ${session.id} (${violations.join(' ')}); re-proposing`,
      );
      return this.runProposeSlots(userId, conversationId, snapshot, sessions);
    }

    // Write the schedule (app-side), then create the owned Google event.
    await this.commandBus.execute<
      UpsertSessionScheduleCommand,
      UpsertSessionScheduleResult
    >(
      new UpsertSessionScheduleCommand(userId, session.id, {
        scheduledDate: slot.scheduledDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        timezone,
        scheduledStartUtc: slot.scheduledStartUtc,
      }),
    );
    const syncable: SyncableSession = {
      id: session.id,
      title: session.title,
      running: session.running,
      strength: session.strength,
      scheduledStartUtc: slot.scheduledStartUtc,
      estDurationMin: session.estDurationMin,
      timezone,
      calendarSync: session.calendarSync,
    };
    const sync = await this.calendarSync.syncWeek(userId, [syncable]);
    // The app-side schedule is committed either way; a failed Google write marks
    // the session `syncState: 'failed'` (still "placed" for the resolver, synced
    // later) — tell the user honestly instead of silently re-proposing forever.
    if (sync.failed > 0) {
      await this.append(userId, conversationId, CALENDAR_WRITE_FAILED, {
        awaitingConfirmation: false,
      });
    }

    // Advance: re-load fresh state and either propose the next session's slots
    // or finish the build (lock the week).
    const after = await this.loadBuild(
      userId,
      conversationId,
      buildContext.programId,
      buildContext.weekIndex,
      null,
    );
    if (!after) {
      return null;
    }
    const phase = resolveBuildPhase(after.snapshot);
    this.logger.log(
      `confirmSlot advance: conversation=${conversationId} phase=${phase}`,
    );
    if (phase === 'PROPOSE_SLOTS') {
      return this.runProposeSlots(
        userId,
        conversationId,
        after.snapshot,
        after.sessions,
      );
    }
    return this.runComplete(
      userId,
      conversationId,
      buildContext.programId,
      after.snapshot,
    );
  }

  /**
   * Finish the build: flip the week to `locked` (idempotent — a locked week is
   * left as-is) and post the completion message. The lock is performed by
   * re-committing the skeleton with this week's `weekState` set to `locked`,
   * preserving its frozen targets.
   */
  private async runComplete(
    userId: string,
    conversationId: string,
    programId: string,
    snapshot: BuildSnapshot,
  ): Promise<BuildTurnResult> {
    if ((snapshot.week.weekState ?? 'open') !== 'locked' && programId) {
      try {
        await this.lockBuildWeek(userId, programId, snapshot.week.weekIndex);
      } catch (err) {
        this.logger.error(`lockBuildWeek failed for ${userId}: ${String(err)}`);
      }
    }
    return this.handled(userId, conversationId, BUILD_COMPLETE, false);
  }

  /**
   * Flip a single week to `locked` by re-committing the skeleton with that
   * week's `weekState` updated. Reuses {@link CommitSkeletonCommand} (the only
   * write path that persists `weekState`); the rest of the weeks pass through
   * unchanged so their state + targets are preserved.
   */
  private async lockBuildWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<void> {
    const active = await this.queryBus.execute<
      GetActiveProgramQuery,
      ActiveProgramResponse
    >(new GetActiveProgramQuery(userId));
    const program = active.program;
    if (!program || program.id !== programId) {
      return;
    }
    const weeks: ProgramWeek[] = program.weeks.map((w) =>
      w.weekIndex === weekIndex ? { ...w, weekState: 'locked' } : w,
    );
    await this.commandBus.execute<CommitSkeletonCommand, CommitSkeletonResult>(
      new CommitSkeletonCommand(
        userId,
        programId,
        weeks,
        program.currentWeekIndex,
      ),
    );
  }

  /**
   * Lock the week if its quota is fulfilled and every committed session is
   * scheduled — idempotent, safe to call from ANY approval path that just
   * finished a week's sessions, not only the build-conversation's own turns.
   */
  async lockWeekIfComplete(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<void> {
    const active = await this.queryBus.execute<
      GetActiveProgramQuery,
      ActiveProgramResponse
    >(new GetActiveProgramQuery(userId));
    const program = active.program;
    if (!program || program.id !== programId) {
      return;
    }
    const week = program.weeks.find((w) => w.weekIndex === weekIndex);
    if (!week || (week.weekState ?? 'open') === 'locked') {
      return;
    }
    const sessions = await this.queryBus.execute<
      GetWeekQuery,
      PlannedSessionResponse[]
    >(new GetWeekQuery(userId, programId, weekIndex));
    if (!isWeekBuildComplete(week, sessions)) {
      return;
    }
    try {
      await this.lockBuildWeek(userId, programId, weekIndex);
    } catch (err) {
      this.logger.error(`lockWeekIfComplete failed for ${userId}: ${String(err)}`);
    }
  }

  /** Render a slot proposal: the given lead-in + a numbered candidate list. */
  private formatSlotProposal(
    leadIn: string,
    candidates: SlotCandidate[],
  ): string {
    const lines = candidates
      .map(
        (c, i) =>
          `${i + 1}. ${this.formatSlotLabel(c)}`,
      )
      .join('\n');
    return `${leadIn}\n${lines}`;
  }

  /** Human-readable "Mon Jul 6, 07:00–08:00" label for one candidate. */
  private formatSlotLabel(c: SlotCandidate): string {
    const weekday = new Date(`${c.scheduledDate}T00:00:00.000Z`).toLocaleDateString(
      'en-US',
      { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' },
    );
    return `${weekday}, ${c.startTime}–${c.endTime}`;
  }

  /**
   * Post a warm welcome message before any proposal: an app-welcome for the
   * very first build (`weekIndex === 0`, onboarding), or a "welcome to week N"
   * recap for every later scheduled build. The message itself is LLM-composed
   * ({@link CoachService.composeWelcome}) from deterministic fact lines gathered
   * here, so it's personal rather than templated; the templated copy remains as
   * the fallback when the run fails or returns nothing. Best-effort — swallows
   * its own errors so a lookup failure never blocks the actual build.
   */
  private async postWelcome(
    userId: string,
    conversationId: string,
    programId: string,
    weekIndex: number,
    discipline: EventDiscipline,
  ): Promise<void> {
    try {
      const { facts, fallback } =
        weekIndex === 0
          ? await this.welcomeSnapshotFacts(userId)
          : await this.weekRecapFacts(userId, programId, weekIndex);

      let text: string | null = null;
      try {
        text = await this.coach.composeWelcome(
          userId,
          `build:welcome:${userId}:${randomUUID()}`,
          discipline,
          { kind: weekIndex === 0 ? 'app' : 'week', weekIndex, facts },
        );
      } catch (err) {
        this.logger.warn(`composeWelcome failed for ${userId}: ${String(err)}`);
      }

      await this.append(userId, conversationId, text ?? fallback, {
        awaitingConfirmation: false,
      });
    } catch (err) {
      this.logger.error(`postWelcome failed for ${userId}: ${String(err)}`);
    }
  }

  /**
   * The onboarding-profile facts feeding the app-welcome (what the athlete told
   * us they want), plus the templated fallback copy.
   */
  private async welcomeSnapshotFacts(
    userId: string,
  ): Promise<{ facts: string[]; fallback: string }> {
    const status = await this.queryBus.execute<
      GetTrainingProfileQuery,
      TrainingProfileStatusResponse
    >(new GetTrainingProfileQuery(userId));
    const profile = status.profile;
    if (!profile) {
      return {
        facts: [],
        fallback:
          "Welcome! I'm excited to help you train. Let's build your first week together.",
      };
    }

    const sessionsPerWeek = profile.availability.length;
    const headline = this.formatProfileHeadline(profile);
    const goal = this.humanize(profile.goal.primaryGoal);

    const facts = [
      `discipline: ${this.humanize(profile.discipline)}`,
      `primary goal: ${goal}`,
      `sessions per week (from their availability): ${sessionsPerWeek}`,
      `preferred session duration: ${profile.sessionDurationMin} min`,
    ];
    if (profile.goal.horizon) {
      facts.push(`program horizon: ${profile.goal.horizon}`);
    }
    if (profile.goal.note) {
      facts.push(`their own words about the goal: "${profile.goal.note}"`);
    }
    if (headline) {
      facts.push(headline);
    }

    const fallback =
      `Welcome to the app! Here's what I've got for you: ${this.humanize(profile.discipline)}, ` +
      `training for "${goal}", about ${sessionsPerWeek} session${sessionsPerWeek === 1 ? '' : 's'}/week ` +
      `at ${profile.sessionDurationMin} min${headline ? `, ${headline}` : ''}. ` +
      `Let's build your first week together.`;

    return { facts, fallback };
  }

  /** Discipline-specific headline stat for the app-welcome snapshot. */
  private formatProfileHeadline(profile: TrainingProfileResponse): string | null {
    if (profile.run) {
      const race = profile.run.targetRace
        ? ` toward a ${profile.run.targetRace}`
        : '';
      return `~${profile.run.weeklyKm}km/week${race}`;
    }
    if (profile.strength) {
      const groups = profile.strength.targetMuscleGroups
        .slice(0, 3)
        .map((g) => this.humanize(g))
        .join(', ');
      return groups ? `focused on ${groups}` : null;
    }
    return null;
  }

  /**
   * The prior-week adherence facts feeding the "welcome to week N" message,
   * plus the templated fallback copy.
   */
  private async weekRecapFacts(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<{ facts: string[]; fallback: string }> {
    const prior = await this.queryBus.execute<
      GetWeekQuery,
      PlannedSessionResponse[]
    >(new GetWeekQuery(userId, programId, weekIndex - 1));

    const opener = `Let's plan week ${weekIndex + 1}.`;
    if (prior.length === 0) {
      return { facts: [], fallback: opener };
    }
    const adherence = computeAdherence(prior);
    if (adherence.totalPlanned === 0 || adherence.completionRate === null) {
      return { facts: [], fallback: opener };
    }
    const pct = Math.round(adherence.completionRate * 100);
    const facts = [
      `last week: completed ${adherence.completed} of ${adherence.totalPlanned} ` +
        `planned session${adherence.totalPlanned === 1 ? '' : 's'} (${pct}%)`,
    ];
    const topSkip = adherence.mostSkipped[0];
    if (topSkip) {
      facts.push(
        `most-skipped session type last week: ${this.humanize(topSkip.key)}`,
      );
    }

    const recap =
      `Nice work last week — you completed ${adherence.completed} of ` +
      `${adherence.totalPlanned} session${adherence.totalPlanned === 1 ? '' : 's'} (${pct}%).`;
    const callout = topSkip
      ? ` A few "${this.humanize(topSkip.key)}" sessions got skipped — we'll keep that in mind.`
      : '';
    return { facts, fallback: `${recap}${callout} ${opener}` };
  }

  /** "target_race" / "full_body" → "target race" / "full body". */
  private humanize(value: string): string {
    return value.replace(/_/g, ' ');
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Derive the message + consent flag from a targets-proposal run. Only a turn
   * that actually STAGED a proposal (terminal `propose_weekly_targets`) puts a
   * decision on the table — the only case the UI may render the Approve/Cancel
   * gate for. A tool-less turn with text is an interview question awaiting a
   * free-text answer, so it must NOT raise `awaitingConfirmation`.
   */
  private proposalOutcome(res: {
    terminalTool: string | null;
    finalText: string | null;
  }): { text: string; awaitingConfirmation: boolean } {
    const proposed = res.terminalTool === 'propose_weekly_targets';
    const text = res.finalText?.trim() ?? '';
    if (proposed) {
      return { text: text || FALLBACK_PROPOSAL, awaitingConfirmation: true };
    }
    if (text) {
      return { text, awaitingConfirmation: false };
    }
    // Defensive: no tool and no text — fall back to the proposal copy so the
    // turn never dead-ends silently (a reply re-runs the same phase).
    return { text: FALLBACK_PROPOSAL, awaitingConfirmation: true };
  }

  /** Resolve the phase a build conversation is in (used by callers/tests). */
  resolvePhase(snapshot: BuildSnapshot): BuildPhase {
    return resolveBuildPhase(snapshot);
  }

  /** Clear the conversation's open card-batch pointer. */
  private async clearPendingBatch(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await this.commandBus.execute(
      new SetPendingCardBatchCommand(userId, conversationId, null),
    );
  }

  /** The active program's discipline (used when the caller didn't supply it). */
  private async resolveDiscipline(userId: string): Promise<EventDiscipline> {
    const active = await this.queryBus.execute<
      GetActiveProgramQuery,
      ActiveProgramResponse
    >(new GetActiveProgramQuery(userId));
    return active.program?.discipline ?? 'running';
  }

  /** The user's IANA timezone for placeholder scheduling (Planner overwrites). */
  private async resolveTimezone(userId: string): Promise<string> {
    const user = await this.queryBus.execute<GetUserQuery, UserResponse>(
      new GetUserQuery(userId),
    );
    return user.timezone ?? 'UTC';
  }

  /**
   * Load everything a turn needs: the resolver snapshot AND the rich
   * `PlannedSessionResponse[]` (the snapshot only carries the resolver's minimal
   * session shape, but drafting + scheduling need slotKey / schedule / calendar
   * fields). Returns null when the build's program/week can't be resolved.
   */
  private async loadBuild(
    userId: string,
    conversationId: string,
    programId: string,
    weekIndex: number,
    pendingCardBatchId: string | null,
  ): Promise<{ snapshot: BuildSnapshot; sessions: PlannedSessionResponse[] } | null> {
    const active = await this.queryBus.execute<
      GetActiveProgramQuery,
      ActiveProgramResponse
    >(new GetActiveProgramQuery(userId));
    const program = active.program;
    if (!program || program.id !== programId) {
      return null;
    }
    const week = program.weeks.find((w) => w.weekIndex === weekIndex);
    if (!week) {
      return null;
    }
    const sessions = await this.queryBus.execute<
      GetWeekQuery,
      PlannedSessionResponse[]
    >(new GetWeekQuery(userId, programId, weekIndex));

    // Resolve the conversation's open card batch (if any) so the resolver can
    // gate on an outstanding per-session decision. Only a `pending` batch gates.
    const pendingBatch = pendingCardBatchId
      ? await this.batches.get(userId, pendingCardBatchId)
      : null;

    // A slot proposal is outstanding iff the latest assistant slotProposal targets
    // a session that still has no calendar event (BW3 — derived, not stored).
    const slotProposalOutstanding = await this.isSlotProposalOutstanding(
      userId,
      conversationId,
      sessions,
    );

    return {
      snapshot: { week, sessions, pendingBatch, slotProposalOutstanding },
      sessions,
    };
  }

  /**
   * Whether the most recent assistant slot proposal is still awaiting a pick:
   * true when its target session exists and has not been scheduled yet. Reads a
   * small window of recent messages (newest first) for the latest `slotProposal`.
   */
  private async isSlotProposalOutstanding(
    userId: string,
    conversationId: string,
    sessions: PlannedSessionResponse[],
  ): Promise<boolean> {
    const proposal = await this.latestSlotProposal(userId, conversationId);
    if (!proposal) {
      return false;
    }
    const target = sessions.find((s) => s.id === proposal.plannedSessionId);
    return target != null && !isSessionScheduled(target);
  }

  /**
   * Whether the once-per-week schedule check-in has already been posted on this
   * conversation. One `program_build` conversation always covers exactly one
   * week's build, so a plain existence scan (no weekIndex filtering) suffices.
   */
  private async hasWeekCheckin(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const page = await this.conversations.listMessages(userId, conversationId, {
      limit: 100,
      order: 'desc',
    });
    return page.items.some(
      (msg) => msg.role === 'assistant' && msg.meta?.weekCheckin === true,
    );
  }

  /** The latest assistant message's `slotProposal` meta, or null if none recent. */
  private async latestSlotProposal(
    userId: string,
    conversationId: string,
  ): Promise<NonNullable<MessageMeta['slotProposal']> | null> {
    const page = await this.conversations.listMessages(userId, conversationId, {
      limit: 20,
      order: 'desc',
    });
    for (const msg of page.items) {
      if (msg.role === 'assistant' && msg.meta?.slotProposal) {
        return msg.meta.slotProposal;
      }
    }
    return null;
  }

  private async handled(
    userId: string,
    conversationId: string,
    reply: string,
    awaitingConfirmation: boolean,
    pendingCardBatchId: string | null = null,
  ): Promise<BuildTurnResult> {
    const assistantMessageId = await this.append(userId, conversationId, reply, {
      awaitingConfirmation,
    });
    return { reply, assistantMessageId, awaitingConfirmation, pendingCardBatchId };
  }

  /**
   * BW4 — post a recoverable-failure reply: the Coach/Planner run aborted, so we
   * surface the fallback copy with a `buildRetry` flag (the FE shows a retry
   * affordance) and keep the turn awaiting so a reply re-runs the same phase.
   * The phase is never advanced on failure, so a retry is exactly a resume.
   */
  private async failed(
    userId: string,
    conversationId: string,
    reply: string,
  ): Promise<BuildTurnResult> {
    const assistantMessageId = await this.append(userId, conversationId, reply, {
      awaitingConfirmation: true,
      buildRetry: true,
    });
    return {
      reply,
      assistantMessageId,
      awaitingConfirmation: true,
      pendingCardBatchId: null,
    };
  }

  /** Append an assistant message and return its id. */
  private async append(
    userId: string,
    conversationId: string,
    content: string,
    meta: {
      awaitingConfirmation: boolean;
      slotProposal?: MessageMeta['slotProposal'];
      buildRetry?: boolean;
      weekCheckin?: boolean;
    },
  ): Promise<string> {
    const messageMeta: MessageMeta = {
      awaitingConfirmation: meta.awaitingConfirmation,
    };
    if (meta.slotProposal) {
      messageMeta.slotProposal = meta.slotProposal;
    }
    if (meta.buildRetry) {
      messageMeta.buildRetry = true;
    }
    if (meta.weekCheckin) {
      messageMeta.weekCheckin = true;
    }
    const { message } = await this.commandBus.execute<
      AppendMessageCommand,
      AppendMessageResult
    >(
      new AppendMessageCommand(
        userId,
        conversationId,
        'assistant',
        content,
        messageMeta,
      ),
    );
    // Out-of-band posts (kickoff welcome/proposal, post-approval drafts) land
    // outside any HTTP turn the client is awaiting, so push a conversation beat
    // over SSE — an open chat reloads its transcript on it instead of polling.
    // (Kickoff timing: onboarding navigates into the chat as soon as the
    // conversation RECORD exists, before these messages are written.)
    this.telemetry.emitConversationOpened({
      userId,
      conversationId,
      title: null,
      origin: 'system',
      attention: false,
    });
    return message.id;
  }
}
