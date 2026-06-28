import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiError } from '../../common/errors/api-error';
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
import { RevisionTrigger } from '../triggers/revision.trigger';
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

export interface ApprovalCardBatch {
  programId: string;
  weekIndex: number;
  cards: ApprovalCard[];
  allowedActions: ApprovalAction[];
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
 *  - revise  → re-enter as a revision trigger (fresh card set).
 *  - reject  → discard the tentative draft, keep the committed fallback — ONLY
 *    legal when such a fallback exists (enforced by approval.policy).
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
    private readonly revision: RevisionTrigger,
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

  /** Revise: re-enter the batch as a revision trigger → a fresh card set. */
  async reviseWeek(userId: string, batchId: string) {
    return this.revision.run(userId, batchId);
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
