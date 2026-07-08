import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiError } from '../../common/errors/api-error';
import { FlushConversationPreferencesCommand } from '../assistant/flush-conversation-preferences.command';
import {
  CommitWeekCommand,
  CommitWeekResult,
} from '../../planned-sessions/application/commands/commit-week.command';
import {
  CommitSessionCommand,
  CommitSessionResult,
} from '../../planned-sessions/application/commands/commit-session.command';
import {
  DiscardTentativeWeekCommand,
  DiscardTentativeWeekResult,
} from '../../planned-sessions/application/commands/discard-tentative-week.command';
import { PlannedSessionResponse } from '../../planned-sessions/application/dto/planned-session.response';
import { GetWeekQuery } from '../../planned-sessions/application/queries/get-week.query';
import {
  CommitSkeletonCommand,
  CommitSkeletonResult,
} from '../../program/application/commands/commit-skeleton.command';
import { ActiveProgramResponse } from '../../program/application/dto/program.response';
import { GetActiveProgramQuery } from '../../program/application/queries/get-active-program.query';
import { ProgramWeek } from '../../program/domain/program.model';
import {
  ApprovalAction,
  allowedApprovalActions,
  rejectionReason,
} from './approval.policy';
import {
  ApprovalCard,
  buildApprovalCards,
  CardSessionLike,
} from './approval-card.builder';
import { CalendarSyncService, CalendarSyncSummary } from './calendar-sync.service';
import { PendingCardBatch } from './domain/pending-card-batch.model';
import { PendingCardBatchService } from './pending-card-batch.service';
import { BuildConversationOrchestrator } from '../build/build-conversation.orchestrator';

export interface ApprovalCardBatch {
  programId: string;
  weekIndex: number;
  cards: ApprovalCard[];
  allowedActions: ApprovalAction[];
}

/** The card batch plus its persisted lifecycle record (controller view). */
export interface ApprovalBatchView extends ApprovalCardBatch {
  batchId: string;
  status: PendingCardBatch['status'];
  kind: PendingCardBatch['kind'];
  conversationId: string | null;
  /** WHY this draft exists (trigger + recovery rationale); null if unexplained. */
  reason: string | null;
}

export interface ApproveResult {
  committed: number;
  calendar: CalendarSyncSummary;
}

/**
 * The approval / card flow. Assembles the per-session card batch for a generated
 * week, and applies the user's chosen action:
 *  - approve → CommitWeekCommand (tentative→committed) + flip the program week to
 *    committed + push owned Google Calendar events (CalendarSyncService).
 *  - reject  → discard the tentative draft, keep the committed fallback — ONLY
 *    legal when such a fallback exists (enforced by approval.policy).
 *
 * Targeted changes no longer flow through a card-revise round-trip: the user
 * adjusts the plan in a Plan-mode conversation, whose net intent is distilled and
 * persisted at the approval action point (see `flushConversationBuffer`).
 *
 * All writes go THROUGH CQRS commands; this service holds no repositories.
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly calendarSync: CalendarSyncService,
    private readonly batches: PendingCardBatchService,
    private readonly buildOrchestrator: BuildConversationOrchestrator,
  ) {}

  /** Build the card batch for a week, diffed against an optional committed baseline. */
  async buildCards(
    userId: string,
    programId: string,
    weekIndex: number,
    opts: {
      baseline?: CardSessionLike[];
      placementNotes?: Record<string, string>;
    } = {},
  ): Promise<ApprovalCardBatch> {
    const draft = await this.fetchWeek(userId, programId, weekIndex);
    const baseline = opts.baseline ?? [];
    const cards = buildApprovalCards({
      draft,
      baseline,
      placementNotes: opts.placementNotes,
    });
    return {
      programId,
      weekIndex,
      cards,
      allowedActions: allowedApprovalActions({
        hasCommittedFallback: baseline.length > 0,
      }),
    };
  }

  /**
   * Approve the generated week: commit the sessions, flip the program week to
   * committed, then sync the owned calendar events. Idempotent — re-approving a
   * committed week commits nothing new but re-syncs the calendar.
   */
  async approveWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<ApproveResult> {
    const { committed } = await this.commandBus.execute<
      CommitWeekCommand,
      CommitWeekResult
    >(new CommitWeekCommand(userId, programId, weekIndex));

    await this.commitProgramWeek(userId, programId, weekIndex);

    const sessions = await this.fetchWeek(userId, programId, weekIndex);
    const calendar = await this.calendarSync.syncWeek(
      userId,
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        running: s.running,
        strength: s.strength,
        scheduledStartUtc: s.scheduledStartUtc,
        estDurationMin: s.estDurationMin,
        timezone: s.timezone,
        calendarSync: s.calendarSync,
      })),
    );

    await this.buildOrchestrator.lockWeekIfComplete(userId, programId, weekIndex);

    this.logger.log(
      `Approved week ${weekIndex} for ${userId}: committed ${committed}, calendar synced ${calendar.synced}/${calendar.synced + calendar.failed}.`,
    );
    return { committed, calendar };
  }

  /**
   * Reject: discard the tentative draft and keep the committed fallback. Only
   * legal when a committed fallback exists (first generation cannot be rejected).
   */
  async rejectWeek(
    userId: string,
    programId: string,
    weekIndex: number,
    hasCommittedFallback: boolean,
  ): Promise<DiscardTentativeWeekResult> {
    const reason = rejectionReason('reject', { hasCommittedFallback });
    if (reason) {
      throw ApiError.badRequest(reason, { programId, weekIndex });
    }
    return this.commandBus.execute<
      DiscardTentativeWeekCommand,
      DiscardTentativeWeekResult
    >(new DiscardTentativeWeekCommand(userId, programId, weekIndex));
  }

  // ── batch-addressed flow (controller surface) ─────────────────────────────

  /**
   * The controller view for a pending batch: rebuild the cards live from the
   * tentative week (committed rows are the diff baseline) and stamp the batch's
   * lifecycle. Card content is never stored — `planned_sessions` is the truth.
   */
  async getBatchView(
    userId: string,
    batchId: string,
  ): Promise<ApprovalBatchView> {
    const batch = await this.requireBatch(userId, batchId);
    const week = await this.fetchWeek(userId, batch.programId, batch.weekIndex);
    // PlannedSessionResponse is structurally a CardSessionLike.
    const baseline = week.filter((s) => s.planState === 'committed');
    const draft = week.filter((s) => s.planState === 'tentative');
    // Conversational build: the card reviews ONE freshly drafted session. The
    // week's committed rows are the sessions already approved earlier in the
    // build — NOT a prior version of this draft — so diffing against them would
    // render them as "removed". Show only the draft, and always allow decline
    // (it reopens the discussion; see rejectBuildSessionBatch).
    const cards =
      batch.kind === 'build_session'
        ? buildApprovalCards({ draft })
        : buildApprovalCards({ draft, baseline });
    return {
      programId: batch.programId,
      weekIndex: batch.weekIndex,
      cards,
      allowedActions:
        batch.kind === 'build_session'
          ? ['approve', 'reject']
          : allowedApprovalActions({
              hasCommittedFallback: baseline.length > 0,
            }),
      batchId: batch.id,
      status: batch.status,
      kind: batch.kind,
      conversationId: batch.conversationId,
      reason: batch.reason,
    };
  }

  /** Approve the batch's week, then mark the batch approved. */
  async approveByBatch(
    userId: string,
    batchId: string,
  ): Promise<ApproveResult> {
    const batch = await this.requirePendingBatch(userId, batchId);

    // Conversational build: a `build_session` card commits exactly the ONE
    // tentative session it drafted — NOT the whole week. The week stays
    // `targets_locked` (no week flip) and calendar scheduling is deferred to
    // BW3, so we don't sync events here. After committing we hand back to the
    // orchestrator to draft the next session (or wrap up the week).
    if (batch.kind === 'build_session') {
      return this.approveBuildSessionBatch(userId, batch);
    }

    const result = await this.approveWeek(
      userId,
      batch.programId,
      batch.weekIndex,
    );
    await this.batches.setStatus(userId, batchId, 'approved');

    // Action point (decision E): approval is the commit point, so flush the
    // chat thread's staging buffer here — distil the Plan-mode iteration to net
    // intent and persist it as one source='chat' batch. Only when this batch
    // came from a conversation (the scheduled fetch has no thread to flush).
    await this.flushConversationBuffer(userId, batch.conversationId, batch.runId);

    return result;
  }

  /**
   * Commit a conversational-build session card: flip every tentative session in
   * the batch's week to `committed` (there is normally exactly one — the freshly
   * drafted next session), mark the batch approved, and ask the orchestrator to
   * advance the build. No week flip and no calendar sync here — the week stays
   * `targets_locked` and slot scheduling is BW3's job.
   */
  private async approveBuildSessionBatch(
    userId: string,
    batch: PendingCardBatch,
  ): Promise<ApproveResult> {
    const week = await this.fetchWeek(userId, batch.programId, batch.weekIndex);
    const tentative = week.filter((s) => s.planState === 'tentative');
    const committedAt = new Date().toISOString();

    for (const session of tentative) {
      await this.commandBus.execute<CommitSessionCommand, CommitSessionResult>(
        // A drafted build session has no prior committed version to diff against,
        // so the display diff is empty — it's a first commit, not an edit.
        new CommitSessionCommand(userId, session.id, {
          committedAt,
          changes: [],
        }),
      );
    }

    await this.batches.setStatus(userId, batch.id, 'approved');

    // Hand back to the build choreography: draft the next session or wrap up.
    // The approved session's title personalizes the transcript acknowledgment.
    // Best-effort: the commit already landed, so a downstream failure (LLM,
    // calendar) must NOT fail this request — the build resumes on the next
    // reply/reopen (resolveBuildPhase re-derives the step).
    if (batch.conversationId) {
      try {
        await this.buildOrchestrator.advanceAfterSessionApproved(
          userId,
          batch.conversationId,
          tentative[0]?.title ?? null,
        );
      } catch (err) {
        this.logger.error(
          `advanceAfterSessionApproved failed for ${userId} (batch ${batch.id}): ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `Approved build session batch ${batch.id} for ${userId}: committed ${tentative.length} session(s).`,
    );
    return {
      committed: tentative.length,
      calendar: { synced: 0, failed: 0 },
    };
  }

  /**
   * Distil + persist the conversation staging buffer at the approval action
   * point. No-op when the batch has no originating thread. Never blocks the
   * approve result — a flush failure leaves the buffer staged for a later retry.
   */
  private async flushConversationBuffer(
    userId: string,
    conversationId: string | null,
    runId: string,
  ): Promise<void> {
    if (!conversationId) {
      return;
    }
    const active = await this.queryBus.execute<
      GetActiveProgramQuery,
      ActiveProgramResponse
    >(new GetActiveProgramQuery(userId));
    const discipline = active.program?.discipline;
    if (!discipline) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    await this.commandBus.execute(
      new FlushConversationPreferencesCommand(
        userId,
        conversationId,
        runId,
        discipline,
        today,
      ),
    );
  }

  /** Reject: discard the draft (only if a committed fallback exists), mark it. */
  async rejectByBatch(
    userId: string,
    batchId: string,
  ): Promise<DiscardTentativeWeekResult> {
    const batch = await this.requirePendingBatch(userId, batchId);

    // Conversational build: rejecting a per-session card is never a dead end —
    // it always reopens a discussion and redrafts, even for the week's very
    // first session (which has no committed fallback yet). This bypasses
    // `rejectWeek`/`approval.policy` entirely; see `rejectBuildSessionBatch`.
    if (batch.kind === 'build_session') {
      return this.rejectBuildSessionBatch(userId, batch);
    }

    const week = await this.fetchWeek(userId, batch.programId, batch.weekIndex);
    const hasCommittedFallback = week.some((s) => s.planState === 'committed');
    const result = await this.rejectWeek(
      userId,
      batch.programId,
      batch.weekIndex,
      hasCommittedFallback,
    );
    await this.batches.setStatus(userId, batchId, 'rejected');
    return result;
  }

  /**
   * Reject a conversational-build session card: mark the batch rejected and ask
   * the orchestrator to reopen the discussion. With no feedback attached (the
   * card's Decline button), the orchestrator posts a deterministic "I saw you
   * passed on X — tell me what you'd like different" and awaits the answer,
   * which then drives the redraft. No `DiscardTentativeWeekCommand`, and no
   * committed-fallback check, since the tentative session isn't discarded here
   * (a redraft naturally replaces it via `replaceTentativeWeek`). Mirrors
   * `approveBuildSessionBatch`.
   */
  private async rejectBuildSessionBatch(
    userId: string,
    batch: PendingCardBatch,
  ): Promise<DiscardTentativeWeekResult> {
    await this.batches.setStatus(userId, batch.id, 'rejected');

    // Best-effort (mirrors approve): the batch is already rejected, so a
    // failure to post the follow-up question must not fail this request.
    if (batch.conversationId) {
      try {
        await this.buildOrchestrator.openSessionRevision(
          userId,
          batch.conversationId,
        );
      } catch (err) {
        this.logger.error(
          `openSessionRevision failed for ${userId} (batch ${batch.id}): ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `Rejected build session batch ${batch.id} for ${userId}: reopened discussion.`,
    );
    return { discarded: 0 };
  }

  private async requireBatch(
    userId: string,
    batchId: string,
  ): Promise<PendingCardBatch> {
    const batch = await this.batches.get(userId, batchId);
    if (!batch) {
      throw ApiError.notFound(`Approval batch ${batchId} not found.`);
    }
    return batch;
  }

  /** Like requireBatch, but refuses an already-actioned (terminal) batch. */
  private async requirePendingBatch(
    userId: string,
    batchId: string,
  ): Promise<PendingCardBatch> {
    const batch = await this.requireBatch(userId, batchId);
    if (batch.status !== 'pending') {
      throw ApiError.badRequest(
        `Approval batch ${batchId} is already ${batch.status}.`,
      );
    }
    return batch;
  }

  private async fetchWeek(
    userId: string,
    programId: string,
    weekIndex: number,
  ): Promise<PlannedSessionResponse[]> {
    return this.queryBus.execute<GetWeekQuery, PlannedSessionResponse[]>(
      new GetWeekQuery(userId, programId, weekIndex),
    );
  }

  /** Flip the program-week skeleton entry to committed + current. */
  private async commitProgramWeek(
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
      w.weekIndex === weekIndex
        ? { ...w, planState: 'committed', status: 'current' }
        : w,
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
}
