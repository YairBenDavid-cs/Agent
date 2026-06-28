import { Message, MessageMeta, MessageRole } from '../../domain/conversation.model';

/** Append one message to a conversation; the repository assigns the seq. */
export class AppendMessageCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    public readonly role: MessageRole,
    public readonly content: string,
    public readonly meta: MessageMeta | null = null,
  ) {}
}

export interface AppendMessageResult {
  message: Message;
}
