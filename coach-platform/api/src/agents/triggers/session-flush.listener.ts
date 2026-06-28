import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CloseConversationCommand } from '../conversation/application/commands/close-conversation.command';
import {
  CONVERSATION_CLOSED,
  ConversationClosedEvent,
} from '../conversation/application/events/conversation-closed.event';
import { GetMessagesQuery } from '../conversation/application/queries/get-messages.query';
import { Message } from '../conversation/domain/conversation.model';
import {
  CONVERSATION_REPOSITORY,
  ConversationRepositoryPort,
  Page,
} from '../conversation/domain/conversation.repository.port';
import { UserResponse } from '../../users/application/dto/user.response';
import { GetUserQuery } from '../../users/application/queries/get-user.query';
import { SessionFlushTrigger } from './session-flush.trigger';

/** A conversation idle for this long is torn down by the sweep. */
const IDLE_HOURS = 6;
/** Max idle conversations a single sweep tick closes (keeps the tick cheap). */
const SWEEP_LIMIT = 200;
/** Transcript window mined on flush (most chats are far shorter). */
const TRANSCRIPT_LIMIT = 100;

/**
 * The `session_flush` delivery seam. Two responsibilities:
 *
 *  1. On `CONVERSATION_CLOSED` (explicit user close OR the idle sweep below), mine
 *     the just-ended transcript for durable INFERRED signals via the
 *     SessionFlushTrigger and write them (pipeline 6 — write + projection rebuild,
 *     never an immediate re-plan).
 *  2. A scheduled sweep closes conversations idle past `IDLE_HOURS`, which itself
 *     fires CONVERSATION_CLOSED → so abandoned chats still get flushed.
 *
 * v1 passes `alreadyCapturedKeys = []`: there is no conversation→event link yet,
 * and inferred signals need reinforcement before they change anything, so a rare
 * duplicate is harmless. Failures are isolated so a flush error never blocks a
 * close.
 */
@Injectable()
export class SessionFlushListener {
  private readonly logger = new Logger(SessionFlushListener.name);

  constructor(
    private readonly flushTrigger: SessionFlushTrigger,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepositoryPort,
  ) {}

  @OnEvent(CONVERSATION_CLOSED)
  async handle(event: ConversationClosedEvent): Promise<void> {
    const { userId, conversationId } = event.payload;
    try {
      const page = await this.queryBus.execute<
        GetMessagesQuery,
        Page<Message>
      >(new GetMessagesQuery(userId, conversationId, null, TRANSCRIPT_LIMIT, 'asc'));

      const transcript = this.toTranscript(page.items);
      if (!transcript) {
        return;
      }

      const user = await this.queryBus.execute<GetUserQuery, UserResponse>(
        new GetUserQuery(userId),
      );

      const { written } = await this.flushTrigger.flush(
        userId,
        `flush:${conversationId}`,
        {
          conversation: transcript,
          alreadyCapturedKeys: [],
          today: this.localToday(user.timezone ?? 'UTC'),
        },
      );
      if (written > 0) {
        this.logger.log(
          `Flushed ${written} inferred signal(s) from conversation ${conversationId}.`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Session flush failed for conversation ${conversationId}: ${String(err)}`,
      );
    }
  }

  /** Hourly: close conversations idle past the window so they get flushed. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepIdle(nowMs: number = Date.now()): Promise<void> {
    const idleBefore = new Date(nowMs - IDLE_HOURS * 3600_000).toISOString();
    const idle = await this.conversations.findIdleActive(idleBefore, SWEEP_LIMIT);
    if (idle.length === 0) {
      return;
    }
    this.logger.log(`Idle sweep closing ${idle.length} conversation(s).`);
    for (const conv of idle) {
      try {
        await this.commandBus.execute(
          new CloseConversationCommand(conv.userId, conv.id, 'idle'),
        );
      } catch (err) {
        this.logger.error(
          `Idle sweep failed to close conversation ${conv.id}: ${String(err)}`,
        );
      }
    }
  }

  /** Render the message list as a plain role-tagged transcript for extraction. */
  private toTranscript(messages: Message[]): string {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
  }

  /** Today's local date (YYYY-MM-DD) in the user's timezone. */
  private localToday(timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}
