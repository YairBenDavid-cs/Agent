import { Conversation, Message, MessageMeta, MessageRole } from './conversation.model';

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/** One page of a cursor-paginated list. `nextCursor` is null on the last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Fields a caller supplies when appending a message (seq is assigned by the repo). */
export interface NewMessage {
  role: MessageRole;
  content: string;
  meta?: MessageMeta | null;
}

/**
 * Persistence port for the conversation/message aggregate. Every method is
 * tenant-scoped by `userId` (structurally, via BaseTenantRepository) so a chat
 * can never be read across tenants.
 */
export interface ConversationRepositoryPort {
  createConversation(userId: string, title?: string | null): Promise<Conversation>;
  findConversation(userId: string, conversationId: string): Promise<Conversation | null>;
  listConversations(
    userId: string,
    opts: { cursor?: string | null; limit: number },
  ): Promise<Page<Conversation>>;

  /** Atomically assigns the next seq and inserts the message. */
  appendMessage(
    userId: string,
    conversationId: string,
    msg: NewMessage,
  ): Promise<Message>;

  /** Cursor-paginated transcript fetch for the UI. */
  listMessages(
    userId: string,
    conversationId: string,
    opts: { cursor?: string | null; limit: number; order: 'asc' | 'desc' },
  ): Promise<Page<Message>>;

  /** Messages with seq > `afterSeq`, ascending — the verbatim window for tier-3 assembly. */
  listMessagesAfterSeq(
    userId: string,
    conversationId: string,
    afterSeq: number,
  ): Promise<Message[]>;

  updateSummary(
    userId: string,
    conversationId: string,
    summary: string,
    summarizedUpToSeq: number,
  ): Promise<void>;

  setPendingCardBatch(
    userId: string,
    conversationId: string,
    cardBatchId: string | null,
  ): Promise<void>;

  closeConversation(userId: string, conversationId: string): Promise<void>;

  /** Active conversations whose last activity is on or before `idleBeforeIso`. */
  findIdleActive(idleBeforeIso: string, limit: number): Promise<Conversation[]>;
}
