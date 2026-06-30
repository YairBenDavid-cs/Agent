import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { ApiError } from '../../../common/errors/api-error';
import {
  CloseConversationCommand,
} from '../../conversation/application/commands/close-conversation.command';
import { DeleteConversationCommand } from '../../conversation/application/commands/delete-conversation.command';
import { SetConversationModeCommand } from '../../conversation/application/commands/set-mode.command';
import { UpdateConversationTitleCommand } from '../../conversation/application/commands/update-title.command';
import {
  StartConversationCommand,
  StartConversationResult,
} from '../../conversation/application/commands/start-conversation.command';
import {
  Conversation,
  Message,
} from '../../conversation/domain/conversation.model';
import { Page } from '../../conversation/domain/conversation.repository.port';
import { FindBuildConversationQuery } from '../../conversation/application/queries/find-build-conversation.query';
import { GetConversationQuery } from '../../conversation/application/queries/get-conversation.query';
import { GetMessagesQuery } from '../../conversation/application/queries/get-messages.query';
import { ListConversationsQuery } from '../../conversation/application/queries/list-conversations.query';
import { TriggerContextResolver } from '../../triggers/trigger-context.resolver';
import { AssistantService, AssistantTurnOutcome } from '../assistant.service';
import { ConfirmSlotDto } from './dto/confirm-slot.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SetModeDto } from './dto/set-mode.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

/** Today's local date (YYYY-MM-DD) in the given IANA timezone. */
function localToday(timezone: string): string {
  // en-CA renders ISO-style YYYY-MM-DD; the tz option does the offset math.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * The chat surface. Conversations + messages are tier-2 (durable transcript);
 * a turn runs the assistant loop (tier-3 working memory assembled server-side)
 * and may eager-write preferences / fire a pipeline. Identity always comes from
 * the JWT — the client never supplies a userId.
 */
@Controller('assistant/conversations')
export class AssistantController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly assistant: AssistantService,
    private readonly triggerContext: TriggerContextResolver,
  ) {}

  /** POST /assistant/conversations — open a new (empty) conversation. */
  @Post()
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartConversationDto,
  ): Promise<StartConversationResult> {
    return this.commandBus.execute<
      StartConversationCommand,
      StartConversationResult
    >(new StartConversationCommand(user.userId, dto.title ?? null));
  }

  /** GET /assistant/conversations — the caller's conversations, newest first. */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Page<Conversation>> {
    return this.queryBus.execute<ListConversationsQuery, Page<Conversation>>(
      new ListConversationsQuery(
        user.userId,
        cursor ?? null,
        limit ? Number(limit) : 20,
      ),
    );
  }

  /**
   * GET /assistant/conversations/build — the in-flight program_build chat the
   * onboarding handoff opened, or `{ conversation: null }` when none is underway.
   * The FE polls this after onboarding finish to navigate the user into the
   * build. MUST stay above `:id` so "build" isn't captured as a conversation id.
   */
  @Get('build')
  async findBuild(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ conversation: Conversation | null }> {
    const conversation = await this.queryBus.execute<
      FindBuildConversationQuery,
      Conversation | null
    >(new FindBuildConversationQuery(user.userId));
    return { conversation };
  }

  /** GET /assistant/conversations/:id — one conversation's metadata. */
  @Get(':id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Conversation> {
    return this.queryBus.execute<GetConversationQuery, Conversation>(
      new GetConversationQuery(user.userId, id),
    );
  }

  /** GET /assistant/conversations/:id/messages — paginated transcript. */
  @Get(':id/messages')
  async messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('order') order?: 'asc' | 'desc',
  ): Promise<Page<Message>> {
    return this.queryBus.execute<GetMessagesQuery, Page<Message>>(
      new GetMessagesQuery(
        user.userId,
        id,
        cursor ?? null,
        limit ? Number(limit) : 30,
        order === 'asc' ? 'asc' : 'desc',
      ),
    );
  }

  /**
   * POST /assistant/conversations/:id/messages — send one turn, get the reply.
   * Pass `id='new'` to open a conversation implicitly on the first message.
   * Synchronous: the reply (and any fired pipeline result) returns in the body;
   * live progress beats stream separately over SSE.
   */
  @Post(':id/messages')
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<AssistantTurnOutcome> {
    const ctx = await this.triggerContext.resolve(user.userId);
    if (!ctx) {
      throw ApiError.badRequest(
        'No active program — generate a program before chatting with the coach.',
      );
    }

    const conversationId =
      id === 'new'
        ? (
            await this.commandBus.execute<
              StartConversationCommand,
              StartConversationResult
            >(new StartConversationCommand(user.userId, null))
          ).conversationId
        : id;

    const runId = randomUUID();
    return this.assistant.handleTurn(
      user.userId,
      conversationId,
      runId,
      dto.message,
      {
        programId: ctx.programId,
        discipline: ctx.discipline,
        weekWindow: ctx.weekWindow,
        timezone: ctx.timezone,
        today: localToday(ctx.timezone),
      },
    );
  }

  /**
   * POST /assistant/conversations/:id/resume — re-greet an in-flight build on
   * reopen. The phase is derived from live state, so this only posts when the
   * build sits on an unperformed step (e.g. an aborted kickoff to retry);
   * otherwise `outcome` is null and the client just renders the transcript.
   */
  @Post(':id/resume')
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ outcome: AssistantTurnOutcome | null }> {
    const outcome = await this.assistant.resumeBuild(user.userId, id);
    return { outcome };
  }

  /**
   * POST /assistant/conversations/:id/confirm-slot — confirm the user's calendar
   * slot pick on a program_build chat. Re-validates the chosen slot against the
   * live calendar, writes the schedule + creates the Google event, then advances
   * the build (proposes the next session's slots or locks the week).
   */
  @Post(':id/confirm-slot')
  async confirmSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmSlotDto,
  ): Promise<AssistantTurnOutcome> {
    return this.assistant.confirmBuildSlot(
      user.userId,
      id,
      dto.scheduledStartUtc,
    );
  }

  /** PATCH /assistant/conversations/:id — rename the conversation. */
  @Patch(':id')
  async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<Conversation> {
    return this.commandBus.execute<UpdateConversationTitleCommand, Conversation>(
      new UpdateConversationTitleCommand(user.userId, id, dto.title),
    );
  }

  /** PATCH /assistant/conversations/:id/mode — toggle Plan/Ask mode. */
  @Patch(':id/mode')
  async setMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetModeDto,
  ): Promise<Conversation> {
    return this.commandBus.execute<SetConversationModeCommand, Conversation>(
      new SetConversationModeCommand(user.userId, id, dto.mode),
    );
  }

  /**
   * DELETE /assistant/conversations/:id — hard-delete the conversation and its
   * messages. Fires no flush; preference events are left intact.
   */
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    await this.commandBus.execute<DeleteConversationCommand, void>(
      new DeleteConversationCommand(user.userId, id),
    );
    return { deleted: true };
  }

  /** POST /assistant/conversations/:id/close — end the session (fires flush). */
  @Post(':id/close')
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ closed: true }> {
    await this.commandBus.execute<CloseConversationCommand, void>(
      new CloseConversationCommand(user.userId, id, 'explicit'),
    );
    return { closed: true };
  }
}
