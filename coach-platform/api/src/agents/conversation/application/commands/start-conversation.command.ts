import { ConversationMode, ConversationOrigin } from '../../domain/conversation.model';

export class StartConversationCommand {
  constructor(
    public readonly userId: string,
    public readonly title: string | null = null,
    /**
     * Lifecycle hints for a non-default conversation. Omitted → a normal
     * user-opened Plan chat. System-originated discretionary chats (Phase 5 D2)
     * set `origin='system'` + `attention=true` so the UI pins + flags them.
     */
    public readonly opts: {
      mode?: ConversationMode;
      origin?: ConversationOrigin;
      attention?: boolean;
    } = {},
  ) {}
}

export interface StartConversationResult {
  conversationId: string;
}
