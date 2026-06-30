import {
  BuildContext,
  ConversationMode,
  ConversationOrigin,
  ConversationPurpose,
} from '../../domain/conversation.model';

export class StartConversationCommand {
  constructor(
    public readonly userId: string,
    public readonly title: string | null = null,
    /**
     * Lifecycle hints for a non-default conversation. Omitted → a normal
     * user-opened chat, which defaults to read-only `ask` mode (mutation is a
     * deliberate switch to Plan). System-originated discretionary chats
     * (Phase 5 D2) set `origin='system'` + `attention=true` so the UI pins +
     * flags them, and default to `plan` because they exist to adjust the week.
     */
    public readonly opts: {
      mode?: ConversationMode;
      origin?: ConversationOrigin;
      attention?: boolean;
      purpose?: ConversationPurpose | null;
      buildContext?: BuildContext | null;
    } = {},
  ) {}
}

export interface StartConversationResult {
  conversationId: string;
}
