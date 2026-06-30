import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, merge, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import {
  AGENT_CONVERSATION,
  AGENT_WORKFLOW,
  AgentConversationEvent,
  AgentWorkflowEvent,
} from '../../shared/llm/agent-telemetry.service';

/**
 * Live agent stream for the chat UI. Carries two event types, both filtered to
 * the authenticated user so one stream never leaks another tenant's data:
 *  - `workflow`     — agent progress beats ("Coach is evaluating your week…").
 *  - `conversation` — a trigger proactively OPENED a chat for the user (e.g. the
 *    outcome-clarify path), so the UI can surface the pinned/flagged chat
 *    without polling.
 *
 * Token counts are NEVER part of any event (they stay in the backend per-call
 * record), so nothing cost-sensitive reaches the browser here.
 *
 * EventSource cannot set headers, so auth rides the cookie or the `?access_token`
 * query fallback wired into the JWT strategy.
 */
@Controller('assistant')
export class WorkflowStreamController {
  constructor(private readonly events: EventEmitter2) {}

  /** GET /assistant/stream — SSE of this user's agent + conversation beats. */
  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    const workflow$ = fromEvent(this.events, AGENT_WORKFLOW).pipe(
      map((payload) => payload as AgentWorkflowEvent),
      filter((event) => event.userId === user.userId),
      map(
        (event): MessageEvent => ({
          type: 'workflow',
          data: {
            agentName: event.agentName,
            phase: event.phase,
            detail: event.detail,
            at: event.at,
          },
        }),
      ),
    );

    const conversation$ = fromEvent(this.events, AGENT_CONVERSATION).pipe(
      map((payload) => payload as AgentConversationEvent),
      filter((event) => event.userId === user.userId),
      map(
        (event): MessageEvent => ({
          type: 'conversation',
          data: {
            conversationId: event.conversationId,
            title: event.title,
            origin: event.origin,
            attention: event.attention,
            at: event.at,
          },
        }),
      ),
    );

    return merge(workflow$, conversation$);
  }
}
