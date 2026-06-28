/** Fired when a conversation is closed (explicitly or by the idle sweep). The
 *  session_flush trigger listens to extract durable-memory signals before the
 *  transcript is "forgotten" from the agent's working context. */
export const CONVERSATION_CLOSED = 'agents.conversation.closed';

export class ConversationClosedEvent {
  constructor(
    public readonly payload: {
      userId: string;
      conversationId: string;
      /** 'explicit' (user closed) or 'idle' (teardown sweep). */
      reason: 'explicit' | 'idle';
    },
  ) {}
}
