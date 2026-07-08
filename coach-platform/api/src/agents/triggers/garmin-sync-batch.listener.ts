import { Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { AppendMessageCommand } from '../conversation/application/commands/append-message.command';
import { SetPendingCardBatchCommand } from '../conversation/application/commands/set-pending-card-batch.command';
import {
  StartConversationCommand,
  StartConversationResult,
} from '../conversation/application/commands/start-conversation.command';
import { AgentTelemetryService } from '../shared/llm/agent-telemetry.service';
import { ApprovalBatchView, ApprovalService } from '../approval/approval.service';
import { ApprovalCard } from '../approval/approval-card.builder';
import { GetGarminSyncScheduleQuery } from '../../ingestion/garmin-sync-schedule/application/queries/get-garmin-sync-schedule.query';
import { GarminSyncSchedule } from '../../ingestion/garmin-sync-schedule/domain/garmin-sync-schedule.model';
import {
  GARMIN_SYNC_BATCH_RECORDED,
  GarminSyncBatchRecordedEvent,
} from '../shared/queue/events/garmin-sync-batch-recorded.event';

const PLAN_TITLE = 'Garmin sync — recommended changes';
const AUTO_TITLE = 'Garmin sync — applied changes';

/**
 * Reacts to a Garmin-sync-originated pending card batch and routes it by the
 * user's chosen `GarminSyncMode` (settings owned by
 * `ingestion/garmin-sync-schedule`):
 *
 *  - `plan`: never auto-mutate. Open a system/plan/attention conversation
 *    presenting the recommended changes and link the batch via
 *    `SetPendingCardBatchCommand` so `ChatApproval` renders it inline —
 *    the user approves/rejects like any other pending batch.
 *  - `auto`: apply immediately (`ApprovalService.approveByBatch`), then open
 *    a system/plan/attention conversation describing what changed. The
 *    attention flag is the "yellow circle" that only clears once the user
 *    opens/replies to the conversation (`ConversationRepository` behavior).
 *
 * Skipped entirely when the sync produced no real diff (every card
 * `unchanged`) — a no-op sync should stay silent, matching the existing
 * daily fetch behavior.
 */
@Injectable()
export class GarminSyncBatchListener {
  private readonly logger = new Logger(GarminSyncBatchListener.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly approval: ApprovalService,
    private readonly telemetry: AgentTelemetryService,
  ) {}

  @OnEvent(GARMIN_SYNC_BATCH_RECORDED)
  async handle(event: GarminSyncBatchRecordedEvent): Promise<void> {
    const { userId, batchId } = event.payload;
    try {
      const view = await this.approval.getBatchView(userId, batchId);
      if (!view.cards.some((c) => c.diffStatus !== 'unchanged')) {
        return;
      }

      const schedule = await this.queryBus.execute<
        GetGarminSyncScheduleQuery,
        GarminSyncSchedule
      >(new GetGarminSyncScheduleQuery(userId));

      if (schedule.mode === 'auto') {
        await this.deliverAuto(userId, view);
      } else {
        await this.deliverPlan(userId, view);
      }
    } catch (err) {
      this.logger.error(
        `Failed to deliver garmin sync batch ${batchId} for ${userId}: ${String(err)}`,
      );
    }
  }

  /** Plan mode: present the recommendation, apply nothing until the user acts. */
  private async deliverPlan(
    userId: string,
    view: ApprovalBatchView,
  ): Promise<void> {
    const conversationId = await this.openConversation(userId, PLAN_TITLE);

    await this.commandBus.execute(
      new AppendMessageCommand(
        userId,
        conversationId,
        'assistant',
        this.describe(
          view,
          "Your Garmin sync picked up new data and I'd recommend a few changes to your week:",
          'Want me to apply these?',
        ),
        { cardBatchId: view.batchId },
      ),
    );
    await this.commandBus.execute(
      new SetPendingCardBatchCommand(userId, conversationId, view.batchId),
    );
  }

  /** Auto mode: apply immediately, then report what changed. */
  private async deliverAuto(
    userId: string,
    view: ApprovalBatchView,
  ): Promise<void> {
    await this.approval.approveByBatch(userId, view.batchId);

    const conversationId = await this.openConversation(userId, AUTO_TITLE);
    await this.commandBus.execute(
      new AppendMessageCommand(
        userId,
        conversationId,
        'assistant',
        this.describe(
          view,
          'Your Garmin sync picked up new data, so I went ahead and updated your week:',
          'Let me know if you want anything adjusted.',
        ),
      ),
    );
  }

  private async openConversation(
    userId: string,
    title: string,
  ): Promise<string> {
    const { conversationId } = await this.commandBus.execute<
      StartConversationCommand,
      StartConversationResult
    >(
      new StartConversationCommand(userId, title, {
        origin: 'system',
        mode: 'plan',
        attention: true,
      }),
    );
    this.telemetry.emitConversationOpened({
      userId,
      conversationId,
      title,
      origin: 'system',
      attention: true,
    });
    return conversationId;
  }

  private describe(
    view: ApprovalBatchView,
    intro: string,
    outro: string,
  ): string {
    const changed = view.cards.filter((c) => c.diffStatus !== 'unchanged');
    const lines = changed.map((c) => this.describeCard(c));
    return [intro, ...lines, outro].join('\n');
  }

  private describeCard(card: ApprovalCard): string {
    const when = `${card.scheduledDate} ${card.startTime}`;
    switch (card.diffStatus) {
      case 'new':
        return `- Added "${card.title}" on ${when}.`;
      case 'removed':
        return `- Removed "${card.title}" (was ${when}).`;
      case 'modified':
        return `- Updated "${card.title}" on ${when} (${card.changedFields.join(', ')}).`;
      default:
        return `- "${card.title}" on ${when}.`;
    }
  }
}
