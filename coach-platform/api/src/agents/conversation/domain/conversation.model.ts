/**
 * Conversation + Message aggregate — the chat persistence layer (tier 2 of the
 * three-tier memory model). A user has many conversations; a conversation has
 * many ordered messages. This store is for UI rendering / audit / replay, and is
 * the boundary that drives `session_flush` on teardown.
 *
 *  - Tier 1 = preference_events / user_preferences (durable personalization).
 *  - Tier 2 = Conversation messages (verbatim transcript, kept forever).      ← here
 *  - Tier 3 = the rolling `summary` field (the agent's working memory of THIS
 *    session; lossy-safe because durable signals already live in tier 1).
 */

export type ConversationStatus = 'active' | 'closed';
export type MessageRole = 'user' | 'assistant' | 'system';

/** Structured action metadata persisted on an assistant turn so the timeline replays. */
export interface MessageMeta {
  /** The assistant's per-turn classifier lane. */
  lane?: 'white' | 'black' | 'gray';
  /** preference_event ids eagerly written this turn. */
  capturedEventIds?: string[];
  /** The pipeline run this turn fired, if any (cards rehydrate from it). */
  pipelineRunId?: string;
  /** The approval card batch this turn produced, if any. */
  cardBatchId?: string;
  /** True when the assistant asked a grounded question and awaits confirmation. */
  awaitingConfirmation?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  /** Denormalized for tenant scoping — every read is filtered by user_id. */
  userId: string;
  /** Monotonic within the conversation; the cursor + ordering key. */
  seq: number;
  role: MessageRole;
  content: string;
  meta: MessageMeta | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  status: ConversationStatus;
  /** Rolling summary (tier 3): '' until the first compaction folds messages in. */
  summary: string;
  /** Messages with seq <= this are folded into `summary` and no longer sent. */
  summarizedUpToSeq: number;
  /** Monotonic counter; the last assigned message seq. */
  lastSeq: number;
  /** The open approval card batch awaiting a decision, if any. */
  pendingCardBatchId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}
