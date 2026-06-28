import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AppendMessageCommand,
} from '../conversation/application/commands/append-message.command';
import {
  StartConversationCommand,
  StartConversationResult,
} from '../conversation/application/commands/start-conversation.command';
import {
  OUTCOME_CLARIFY_NEEDED,
  OutcomeClarifyNeededEvent,
} from './outcome.trigger';

/**
 * Delivers the outcome HITL clarifying question. When a negative/missed outcome
 * is detected, the outcome trigger emits `OUTCOME_CLARIFY_NEEDED`; this listener
 * opens (or reuses) a conversation and posts ONE grounded assistant question
 * with `meta.awaitingConfirmation = true`. The user's reply then flows through
 * the normal assistant turn — exactly like a mid-chat revision — so the Coach
 * adjusts upcoming sessions with the user's real explanation in hand.
 *
 * v1 delivers immediately into a fresh conversation rather than batching to
 * end-of-day in the user's TZ; the batching seam can wrap this later without
 * changing the reply path. Failures are isolated so a delivery error never
 * breaks outcome recording.
 */
@Injectable()
export class OutcomeClarifyListener {
  private readonly logger = new Logger(OutcomeClarifyListener.name);

  constructor(private readonly commandBus: CommandBus) {}

  @OnEvent(OUTCOME_CLARIFY_NEEDED)
  async handle(event: OutcomeClarifyNeededEvent): Promise<void> {
    const { userId, plannedSessionId, status, reasonCode } = event.payload;
    try {
      const { conversationId } =
        await this.commandBus.execute<
          StartConversationCommand,
          StartConversationResult
        >(new StartConversationCommand(userId, 'Checking in on your session'));

      await this.commandBus.execute(
        new AppendMessageCommand(
          userId,
          conversationId,
          'assistant',
          this.question(status, reasonCode),
          { awaitingConfirmation: true },
        ),
      );
      this.logger.log(
        `Outcome clarify delivered for ${plannedSessionId} → conversation ${conversationId}.`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to deliver outcome clarify for ${plannedSessionId}: ${String(err)}`,
      );
    }
  }

  /** A grounded, single question tailored to the detected outcome. */
  private question(status: string, reasonCode: string | null): string {
    if (status === 'missed') {
      return "I noticed you didn't get to today's session — what got in the way? If it was timing, energy, or motivation, tell me and I'll adjust the rest of your week.";
    }
    switch (reasonCode) {
      case 'too_hard':
        return 'That session looked tough. Was it the intensity, the volume, or just an off day? Let me know and I can ease the upcoming sessions.';
      case 'too_easy':
        return 'Looks like that one felt easy. Want me to add a bit more challenge to the rest of the week?';
      case 'volume_too_high':
        return 'That felt like a lot of volume. Should I trim the distance/sets on your upcoming sessions?';
      case 'volume_too_low':
        return 'That felt light on volume. Want me to build up the rest of the week a little?';
      case 'no_motivation':
        return "Sounds like motivation was low today. What would make the next few sessions feel more doable?";
      case 'disliked_exercise':
        return 'Noted that you disliked something in that session. Which part — and should I swap it out going forward?';
      case 'disliked_time':
        return "Seems the timing didn't work. What window suits you better, and I'll re-place the week?";
      default:
        return 'How did that session go for you? Anything you want me to adjust in the rest of the week?';
    }
  }
}
