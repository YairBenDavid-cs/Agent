import type { AssistantConversation, AssistantTurn } from '../types/assistant';

// In-memory assistant data for frontend-only mode. Replaced by real backend
// calls when VITE_MOCK_API=false.
const conversations = new Map<string, AssistantConversation>();
const turns = new Map<string, AssistantTurn[]>();

export function mockListConversations(): AssistantConversation[] {
  return [...conversations.values()];
}

export function mockCreateConversation(): AssistantConversation {
  const id = crypto.randomUUID();
  const conversation: AssistantConversation = {
    id,
    type: 'assistant',
    title: 'New chat',
    lastMessageAt: new Date().toISOString(),
  };
  conversations.set(id, conversation);
  turns.set(id, []);
  return conversation;
}

export function mockListTurns(conversationId: string): AssistantTurn[] {
  return turns.get(conversationId) ?? [];
}

export function mockPostMessage(conversationId: string, text: string): AssistantTurn {
  const turn: AssistantTurn = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user',
    text,
    createdAt: new Date().toISOString(),
  };
  const existing = turns.get(conversationId) ?? [];
  turns.set(conversationId, [...existing, turn]);
  const conversation = conversations.get(conversationId);
  if (conversation !== undefined) {
    conversations.set(conversationId, { ...conversation, lastMessageAt: turn.createdAt });
  }
  return turn;
}

export function mockRecordReply(conversationId: string, reply: AssistantTurn): void {
  const existing = turns.get(conversationId) ?? [];
  turns.set(conversationId, [...existing, reply]);
}
