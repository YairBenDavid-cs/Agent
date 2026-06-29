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

/**
 * Dual-mode interface (Claude-style):
 *  - `plan` = mutating. Holds the write seam; lane classification can capture
 *    preferences and (later) drive commits/replans.
 *  - `ask`  = read-only consultation. The turn never writes preferences and
 *    never fires a pipeline; mutation intent surfaces a "switch to Plan" hint.
 * Mode is explicit conversation state — capability is a boundary, never inferred.
 */
export type ConversationMode = 'plan' | 'ask';

/**
 * Who opened the conversation:
 *  - `user`   = the human started it from the chat surface.
 *  - `system` = proactively opened after a sync/data event that needs a
 *    discussion before mutating (rendered pinned + flagged for attention).
 */
export type ConversationOrigin = 'user' | 'system';

/**
 * A captured-but-not-yet-committed preference signal held in the conversation
 * staging buffer (tier-2 scratch). During Plan-mode iteration the user may keep
 * adjusting a request (lower the pace, then raise it again); each adjustment is
 * staged here as a candidate and nothing hits the durable preference log until
 * the action point, when a distillation pass collapses the buffer to net intent.
 *
 * The shape is deliberately NEUTRAL (primitives only) so the conversation domain
 * does not depend on the assistant's `CapturedSignal`; the assistant maps to/from
 * this type. It mirrors the captured-signal fields plus `lane` (so distillation
 * knows hard/soft) and `capturedAt` (so net-intent respects iteration order).
 */
export interface PendingCandidate {
  /** The classifier lane at capture time: `black` = hard, `gray` = soft. */
  lane: 'black' | 'gray';
  tagType: string;
  value: string | number | null;
  polarity: 'avoid' | 'prefer' | 'increase' | 'decrease' | 'neutral';
  durability: 'standing' | 'one_off';
  scope: 'global' | 'session' | 'exercise';
  discipline: 'running' | 'strength' | null;
  /** The assistant's grounded judgment of whether this touches the current week. */
  affectsCurrentWeek: boolean;
  target: {
    plannedSessionId: string | null;
    exerciseId: string | null;
    runType: string | null;
  } | null;
  rawText?: string;
  /** ISO timestamp — preserves the iteration order distillation reads. */
  capturedAt: string;
}

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
  /** Plan (mutating) vs Ask (read-only). Defaults to `plan` for back-compat. */
  mode: ConversationMode;
  /** `user` (human-opened) vs `system` (proactively opened after a sync event). */
  origin: ConversationOrigin;
  /** True for system-opened chats the user should read (pinned + flagged). */
  attention: boolean;
  /** Rolling summary (tier 3): '' until the first compaction folds messages in. */
  summary: string;
  /** Messages with seq <= this are folded into `summary` and no longer sent. */
  summarizedUpToSeq: number;
  /** Monotonic counter; the last assigned message seq. */
  lastSeq: number;
  /** The open approval card batch awaiting a decision, if any. */
  pendingCardBatchId: string | null;
  /**
   * Staging buffer: preference signals captured during Plan-mode iteration that
   * have not yet been distilled + committed at an action point. Empty by default.
   */
  pendingCandidates: PendingCandidate[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}
