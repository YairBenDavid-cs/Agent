import { ConversationMode } from '../../domain/conversation.model';

/** Toggle a conversation between Plan (mutating) and Ask (read-only) mode. */
export class SetConversationModeCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly mode: ConversationMode,
  ) {}
}
