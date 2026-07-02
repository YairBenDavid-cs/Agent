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
    mode: 'ask',
    origin: 'user',
    attention: false,
    pendingCardBatchId: null,
    purpose: null,
    buildContext: null,
  };
  conversations.set(id, conversation);
  turns.set(id, []);
  return conversation;
}

export function mockRenameConversation(
  conversationId: string,
  title: string,
): AssistantConversation {
  const existing = conversations.get(conversationId);
  const updated: AssistantConversation = existing
    ? { ...existing, title }
    : {
        id: conversationId,
        type: 'assistant',
        title,
        lastMessageAt: new Date().toISOString(),
        mode: 'ask',
        origin: 'user',
        attention: false,
        pendingCardBatchId: null,
        purpose: null,
        buildContext: null,
      };
  conversations.set(conversationId, updated);
  return updated;
}

export function mockDeleteConversation(conversationId: string): void {
  conversations.delete(conversationId);
  turns.delete(conversationId);
}

export function mockListTurns(conversationId: string): AssistantTurn[] {
  return turns.get(conversationId) ?? [];
}

// Canned reply used in frontend-only mode so the chat works without a backend.
const MOCK_REPLY =
  'This is a preview of the assistant UI. The interface is fully wired — once the ' +
  'coach-platform backend is connected, real answers will appear right here.';

// Mirrors the real backend: persists the user turn, runs the (fake) agent, and
// returns the assistant reply. The client renders the user turn optimistically,
// so only the reply is needed by the caller.
export function mockPostMessage(conversationId: string, text: string): AssistantTurn {
  const userTurn: AssistantTurn = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user',
    text,
    createdAt: new Date().toISOString(),
  };
  const reply: AssistantTurn = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'assistant',
    text: MOCK_REPLY,
    createdAt: new Date().toISOString(),
  };
  const existing = turns.get(conversationId) ?? [];
  turns.set(conversationId, [...existing, userTurn, reply]);
  const conversation = conversations.get(conversationId);
  if (conversation !== undefined) {
    conversations.set(conversationId, { ...conversation, lastMessageAt: reply.createdAt });
  }
  return reply;
}
