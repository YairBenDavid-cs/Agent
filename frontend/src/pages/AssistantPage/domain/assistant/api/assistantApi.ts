import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type { AssistantConversation, AssistantTurn } from '../types/assistant';
import {
  mockCreateConversation,
  mockListConversations,
  mockListTurns,
  mockPostMessage,
} from './mockAssistant';

// Backend wraps paginated lists in a Page envelope; we unwrap to keep hook
// types simple (they work with plain arrays).
interface Page<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

// Backend Conversation shape → frontend AssistantConversation
interface BackendConversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

// Backend Message shape → frontend AssistantTurn
interface BackendMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

// Backend response for POST …/messages (AssistantTurnOutcome)
interface AssistantTurnOutcome {
  conversationId: string;
  assistantMessageId: string;
  reply: string;
  lane: string;
  capturedCount: number;
  inferred: boolean;
  awaitingConfirmation: boolean;
  pipelineRun: unknown | null;
}

function toConversation(c: BackendConversation): AssistantConversation {
  return {
    id: c.id,
    type: 'assistant',
    title: c.title ?? 'New conversation',
    lastMessageAt: c.updatedAt,
  };
}

function toTurn(m: BackendMessage): AssistantTurn {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role === 'system' ? 'assistant' : m.role,
    text: m.content,
    createdAt: m.createdAt,
  };
}

export async function listAssistantConversations(): Promise<AssistantConversation[]> {
  if (MOCK_API) {
    return Promise.resolve(mockListConversations());
  }
  const page = await request<Page<BackendConversation>>('/assistant/conversations');
  return page.items.map(toConversation);
}

export async function createAssistantConversation(): Promise<AssistantConversation> {
  if (MOCK_API) {
    return Promise.resolve(mockCreateConversation());
  }
  const conv = await request<BackendConversation>('/assistant/conversations', {
    method: 'POST',
    body: {},
  });
  return toConversation(conv);
}

export async function listAssistantTurns(conversationId: string): Promise<AssistantTurn[]> {
  if (MOCK_API) {
    return Promise.resolve(mockListTurns(conversationId));
  }
  const page = await request<Page<BackendMessage>>(
    `/assistant/conversations/${conversationId}/messages?order=asc&limit=100`,
  );
  return page.items.map(toTurn);
}

export async function postAssistantMessage(
  conversationId: string,
  text: string,
): Promise<AssistantTurn> {
  if (MOCK_API) {
    return Promise.resolve(mockPostMessage(conversationId, text));
  }
  const outcome = await request<AssistantTurnOutcome>(
    `/assistant/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: { message: text },
    },
  );
  // The outcome carries the assistant reply; synthesise an AssistantTurn so the
  // hook pipeline stays uniform (it always works with AssistantTurn objects).
  return {
    id: outcome.assistantMessageId,
    conversationId: outcome.conversationId,
    role: 'assistant',
    text: outcome.reply,
    createdAt: new Date().toISOString(),
  };
}
