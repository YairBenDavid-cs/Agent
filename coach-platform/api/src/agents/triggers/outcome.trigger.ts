import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  OUTCOME_RECORDED,
  OutcomeRecordedEvent,
} from '../../planned-sessions/application/events/outcome-recorded.event';
import { Pipeline } from '../orchestrator/pipeline.types';
import { PipelineQueue } from '../shared/queue/pipeline-queue.service';
import { classifyOutcome } from './outcome.policy';
import { TriggerContextResolver } from './trigger-context.resolver';

/** Emitted when a negative/missed outcome needs an end-of-day clarifying question. */
export const OUTCOME_CLARIFY_NEEDED = 'agents.outcome.clarify-needed';

export class OutcomeClarifyNeededEvent {
  constructor(
    public readonly payload: {
      userId: string;
      plannedSessionId: string;
      scheduledDate: string;
      status: string;
      reasonCode: string | null;
    },
  ) {}
}

/**
 * The `outcome` trigger. Hooks the existing OUTCOME_RECORDED seam and applies
 * the deterministic policy:
 *  - injury/illness → fire the SAFETY_REPLAN pipeline NOW (no debounce);
 *  - any other negative/missed outcome → emit a clarify-needed seam (the HITL
 *    surface batches these to end-of-day in the user's TZ and routes the reply
 *    through the assistant, exactly like a mid-chat revision);
 *  - clean/positive → do nothing (never interrupt).
 * Failures are isolated so a trigger error never breaks outcome recording.
 */
@Injectable()
export class OutcomeTrigger {
  private readonly logger = new Logger(OutcomeTrigger.name);

  constructor(
    private readonly resolver: TriggerContextResolver,
    private readonly queue: PipelineQueue,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(OUTCOME_RECORDED)
  async handle(event: OutcomeRecordedEvent): Promise<void> {
    const { userId, plannedSessionId, status, reasonCode, scheduledDate } =
      event.payload;
    const action = classifyOutcome(status, reasonCode);

    try {
      if (action === 'immediate_safety') {
        const ctx = await this.resolver.resolve(userId);
        if (!ctx) {
          return;
        }
        await this.queue.enqueue({
          pipeline: Pipeline.SAFETY_REPLAN,
          ctx: {
            userId,
            runId: `outcome-safety:${plannedSessionId}`,
            discipline: ctx.discipline,
            timezone: ctx.timezone,
            weekWindow: ctx.weekWindow,
            weekIndex: ctx.weekIndex,
            programId: ctx.programId,
          },
        });
        this.logger.log(
          `Outcome ${plannedSessionId}: injury/illness → SAFETY_REPLAN enqueued.`,
        );
      } else if (action === 'ask_clarifying') {
        this.events.emit(
          OUTCOME_CLARIFY_NEEDED,
          new OutcomeClarifyNeededEvent({
            userId,
            plannedSessionId,
            scheduledDate,
            status,
            reasonCode,
          }),
        );
      }
    } catch (err) {
      this.logger.error(
        `Outcome trigger failed for ${plannedSessionId}: ${String(err)}`,
      );
    }
  }
}
