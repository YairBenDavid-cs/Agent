/** Persist a compacted rolling summary + advance the summarized-up-to pointer. */
export class UpdateConversationSummaryCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly summary: string,
    public readonly summarizedUpToSeq: number,
  ) {}
}
