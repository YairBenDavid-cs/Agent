import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiError } from '../../common/errors/api-error';
import { FlushConversationPreferencesCommand } from '../assistant/flush-conversation-preferences.command';
import {
  CommitWeekCommand,
  CommitWeekResult,
} from '../../planned-sessions/application/commands/commit-week.command';
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
        coachNotes: s.coachNotes,
        scheduledStartUtc: s.scheduledStartUtc,
        estDurationMin: s.estDurationMin,
        timezone: s.timezone,
        calendarSync: s.calendarSync,
      })),
    );

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
    const cards = buildApprovalCards({ draft, baseline });
    return {
      programId: batch.programId,
      weekIndex: batch.weekIndex,
      cards,
      allowedActions: allowedApprovalActions({
        hasCommittedFallback: baseline.length > 0,
      }),
      batchId: batch.id,
      status: batch.status,
      kind: batch.kind,
      conversationId: batch.conversationId,
    };
  }

  /** Approve the batch's week, then mark the batch approved. */
  async approveByBatch(
    userId: string,
    batchId: string,
  ): Promise<ApproveResult> {
    const batch = await this.requirePendingBatch(userId, batchId);
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
