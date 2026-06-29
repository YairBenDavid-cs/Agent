/** Rename a conversation (UI affordance only). */
export class UpdateConversationTitleCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly title: string,
  ) {}
}
