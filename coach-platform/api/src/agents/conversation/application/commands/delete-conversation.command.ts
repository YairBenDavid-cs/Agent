/** Hard-delete a conversation and its messages. Unlike close, this fires no
 *  session_flush — a user deleting a chat is discarding it, not distilling it. */
export class DeleteConversationCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
  ) {}
}
