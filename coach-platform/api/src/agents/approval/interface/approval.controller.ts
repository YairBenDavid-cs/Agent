import { Controller, Get, Param, Post } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { DiscardTentativeWeekResult } from '../../../planned-sessions/application/commands/discard-tentative-week.command';
import {
  ApprovalBatchView,
  ApprovalService,
  ApproveResult,
} from '../approval.service';
import { PendingCardBatch } from '../domain/pending-card-batch.model';
import { PendingCardBatchService } from '../pending-card-batch.service';

/**
 * The approval / card surface. A generated week is a batch of per-session cards
 * the user acts on as a unit: approve (commit + sync calendar) or reject (discard
 * the draft, keep the committed week — only when one exists). Targeted changes are
 * made by conversing in Plan mode, not a card-revise round-trip. Card content is
 * rebuilt live from the tentative `planned_sessions`; identity comes from the JWT.
 */
@Controller('assistant/approvals')
export class ApprovalController {
  constructor(
    private readonly approval: ApprovalService,
    private readonly batches: PendingCardBatchService,
  ) {}

  /** GET /assistant/approvals — the caller's pending card batches. */
  @Get()
  async listPending(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PendingCardBatch[]> {
    return this.batches.listPending(user.userId);
  }

  /** GET /assistant/approvals/:batchId — the full card set + lifecycle. */
  @Get(':batchId')
  async view(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batchId') batchId: string,
  ): Promise<ApprovalBatchView> {
    return this.approval.getBatchView(user.userId, batchId);
  }

  /** POST /assistant/approvals/:batchId/approve — commit the week + sync. */
  @Post(':batchId/approve')
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batchId') batchId: string,
  ): Promise<ApproveResult> {
    return this.approval.approveByBatch(user.userId, batchId);
  }

  /** POST /assistant/approvals/:batchId/reject — discard draft, keep committed. */
  @Post(':batchId/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('batchId') batchId: string,
  ): Promise<DiscardTentativeWeekResult> {
    return this.approval.rejectByBatch(user.userId, batchId);
  }
}
