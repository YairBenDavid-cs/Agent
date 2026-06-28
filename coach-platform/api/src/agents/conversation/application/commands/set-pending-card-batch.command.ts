/** Link (or clear) the open approval card batch on a conversation. */
export class SetPendingCardBatchCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly cardBatchId: string | null,
  ) {}
}
