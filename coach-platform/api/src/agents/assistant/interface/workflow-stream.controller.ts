import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import {
  AGENT_WORKFLOW,
  AgentWorkflowEvent,
} from '../../shared/llm/agent-telemetry.service';

/**
 * Live agent-workflow stream for the chat UI ("Coach is evaluating your week…",
 * "Calling Calendar Tool…"). Server-Sent Events, filtered to the authenticated
 * user so one stream never leaks another tenant's progress. Token counts are
 * NEVER part of the workflow event (they stay in the backend per-call record),
 * so nothing cost-sensitive reaches the browser here.
 *
 * EventSource cannot set headers, so auth rides the cookie or the `?access_token`
 * query fallback wired into the JWT strategy.
 */
@Controller('assistant')
export class WorkflowStreamController {
  constructor(private readonly events: EventEmitter2) {}

  /** GET /assistant/stream — SSE of this user's agent progress beats. */
  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return fromEvent(this.events, AGENT_WORKFLOW).pipe(
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
  }
}
