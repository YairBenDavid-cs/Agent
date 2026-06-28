/** Close a conversation. `reason` distinguishes an explicit user close from the
 *  idle teardown sweep; both fire ConversationClosedEvent for session_flush. */
export class CloseConversationCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly reason: 'explicit' | 'idle' = 'explicit',
  ) {}
}
