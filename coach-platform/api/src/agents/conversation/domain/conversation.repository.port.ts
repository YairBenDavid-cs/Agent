import {
  BuildContext,
  Conversation,
  ConversationMode,
  ConversationOrigin,
  ConversationPurpose,
  Message,
  MessageMeta,
  MessageRole,
  PendingCandidate,
} from './conversation.model';

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
  createConversation(
    userId: string,
    title?: string | null,
    opts?: {
      mode?: ConversationMode;
      origin?: ConversationOrigin;
      attention?: boolean;
      purpose?: ConversationPurpose | null;
      buildContext?: BuildContext | null;
    },
  ): Promise<Conversation>;
  findConversation(userId: string, conversationId: string): Promise<Conversation | null>;

  /**
   * The user's active `program_build` conversation, if one is in flight (the
   * onboarding handoff target). At most one exists; the most recently touched
   * active one wins. Null when there's no build underway.
   */
  findOpenBuildConversation(userId: string): Promise<Conversation | null>;

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

  /**
   * Hard-delete the conversation and cascade-delete its messages. Returns false
   * when no conversation matched (already gone / wrong tenant). Preference
   * events are intentionally NOT touched — they are the durable signal and have
   * no back-link to the transcript.
   */
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;

  /** Rename a conversation. Returns the updated record, or null when not found. */
  updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<Conversation | null>;

  /** Toggle Plan/Ask mode. Returns the updated record, or null when not found. */
  setMode(
    userId: string,
    conversationId: string,
    mode: ConversationMode,
  ): Promise<Conversation | null>;

  /** Active conversations whose last activity is on or before `idleBeforeIso`. */
  findIdleActive(idleBeforeIso: string, limit: number): Promise<Conversation[]>;

  /**
   * Append candidates to the conversation staging buffer (Plan-mode iteration).
   * Returns the updated record, or null when not found. Append-only until the
   * action point flush; retractions are handled by re-distilling net intent.
   */
  addPendingCandidates(
    userId: string,
    conversationId: string,
    candidates: PendingCandidate[],
  ): Promise<Conversation | null>;

  /** Empty the staging buffer (called after an action-point flush). */
  clearPendingCandidates(
    userId: string,
    conversationId: string,
  ): Promise<void>;
}
