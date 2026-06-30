// Frontend view + wire types for the assistant chat, mirrored from the backend
// (agents/conversation/domain/conversation.model.ts and assistant.service.ts).
// Kept narrow: only the fields the chat UI renders or branches on.

// from conversation.model.ts
export type ConversationMode = 'plan' | 'ask';
export type ConversationOrigin = 'user' | 'system';

// from conversation.model.ts — Message.meta. All optional; the backend stamps
// only what a given turn produced.
export interface MessageMeta {
  lane?: 'white' | 'black' | 'gray';
  capturedEventIds?: string[];
  pipelineRunId?: string;
  cardBatchId?: string;
  awaitingConfirmation?: boolean;
}

export interface AssistantConversation {
  id: string;
  type: 'assistant';
  title: string;
  lastMessageAt: string;
  // Dual-mode redesign fields. New user chats open `ask`; system chats `plan`.
  mode: ConversationMode;
  origin: ConversationOrigin;
  // Pinned/flagged for the user (a trigger opened it). Cleared server-side on
  // the user's first reply — the UI just refetches.
  attention: boolean;
  // The card batch awaiting review for this conversation, if any.
  pendingCardBatchId: string | null;
}

export type AssistantTurnRole = 'user' | 'assistant';

export interface AssistantTurn {
  id: string;
  conversationId: string;
  role: AssistantTurnRole;
  text: string;
  createdAt: string;
  // Carried through so the transcript can render lane / confirmation affordances.
  meta?: MessageMeta | null;
}

// from agents/orchestrator/pipeline.types.ts — the synchronous pipeline outcome
// of a turn. `superseded` means the shown card is stale and must be invalidated.
export interface PipelineRunResult {
  pipeline: string;
  status: 'completed' | 'aborted';
  stages: string[];
  abortReason?: string;
  superseded?: boolean;
}

// from assistant.service.ts — the full body of POST .../messages. The frontend
// maps this into an appended assistant turn plus the turn-level signals the chat
// surface branches on (card batch, intent block, confirmation).
export interface AssistantTurnResult {
  // The appended assistant reply, with its meta.
  turn: AssistantTurn;
  // Resolves the implicit `id='new'` open.
  conversationId: string;
  // ASK-mode mutation refused → offer "Switch to Plan".
  intentBlocked: boolean;
  // The assistant asked a yes/no question → offer Approve / Cancel.
  awaitingConfirmation: boolean;
  // A pipeline fired this turn (a card batch may now be pending).
  pipelineRun: PipelineRunResult | null;
}

// A first prompt handed from the start screen to the conversation it just created,
// so the new conversation can auto-send it once after navigation.
export interface PendingPrompt {
  id: string;
  text: string;
}
