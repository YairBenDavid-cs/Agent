export class StartConversationCommand {
  constructor(
    public readonly userId: string,
    public readonly title: string | null = null,
  ) {}
}

export interface StartConversationResult {
  conversationId: string;
}
