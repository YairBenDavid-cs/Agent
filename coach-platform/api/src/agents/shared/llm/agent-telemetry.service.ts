import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LlmTokenUsage } from './llm.types';

/** Emitted for every model call. Backend logs the full record (incl. tokens);
 * the frontend listens for `agent.workflow` to render live progress but the
 * token counts are stripped before they reach the end-user. */
export const AGENT_LLM_CALL = 'agent.llm_call';
export const AGENT_WORKFLOW = 'agent.workflow';
export const AGENT_CONVERSATION = 'agent.conversation';

export interface AgentLlmCallEvent {
  agentName: string;
  model: string;
  usage: LlmTokenUsage;
  durationMs: number;
  toolCalls: string[];
  at: string; // ISO
}

/** A user-facing progress beat ("Coach is evaluating your week…"). Never
 * carries token counts — those stay server-side. */
export interface AgentWorkflowEvent {
  userId: string;
  agentName: string;
  phase: string;
  detail?: string;
  at: string; // ISO
}

/**
 * Pushed when a trigger proactively OPENS a conversation for the user (e.g. the
 * outcome-clarify path). Lets the chat UI surface the pinned/flagged chat
 * without polling. Fields are primitives so this sink stays decoupled from the
 * conversation domain. */
export interface AgentConversationEvent {
  userId: string;
  conversationId: string;
  title: string | null;
  origin: 'user' | 'system';
  attention: boolean;
  at: string; // ISO
}

/**
 * Single sink for agent observability. Backend gets the full per-call record
 * (agent, model, tokens, tools, latency); a separate workflow stream feeds the
 * chat UI without leaking cost data.
 */
@Injectable()
export class AgentTelemetryService {
  private readonly logger = new Logger('AgentTelemetry');

  constructor(private readonly events: EventEmitter2) {}

  recordLlmCall(event: AgentLlmCallEvent): void {
    this.logger.log(
      `${event.agentName} model=${event.model} tokens=${event.usage.totalTokens} ` +
        `(p=${event.usage.promptTokens}/c=${event.usage.completionTokens}) ` +
        `tools=[${event.toolCalls.join(',')}] ${event.durationMs}ms`,
    );
    this.events.emit(AGENT_LLM_CALL, event);
  }

  /** Push a user-facing progress beat for the chat workflow view. */
  emitWorkflow(
    userId: string,
    agentName: string,
    phase: string,
    detail?: string,
  ): void {
    const event: AgentWorkflowEvent = {
      userId,
      agentName,
      phase,
      detail,
      at: new Date().toISOString(),
    };
    this.events.emit(AGENT_WORKFLOW, event);
  }

  /** Push a "a conversation was opened for you" beat (trigger-originated chats). */
  emitConversationOpened(
    event: Omit<AgentConversationEvent, 'at'> & { at?: string },
  ): void {
    this.events.emit(AGENT_CONVERSATION, {
      ...event,
      at: event.at ?? new Date().toISOString(),
    } satisfies AgentConversationEvent);
  }
}
