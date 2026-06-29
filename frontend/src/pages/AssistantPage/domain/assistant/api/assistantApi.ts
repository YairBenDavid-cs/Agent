import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type { AssistantConversation, AssistantTurn } from '../types/assistant';
import {
  mockCreateConversation,
  mockDeleteConversation,
  mockListConversations,
  mockListTurns,
  mockPostMessage,
  mockRenameConversation,
} from './mockAssistant';

// Backend wire shapes, mirrored from coach-platform (not imported across
// packages). The mappers below translate them into the frontend's view types.
interface ApiConversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ApiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface ApiPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface StartConversationResult {
  conversationId: string;
}

// The synchronous turn result: the backend runs the whole agent loop and
// returns the full assistant reply in the body (no token streaming).
interface AssistantTurnOutcome {
  reply: string;
  conversationId: string;
  assistantMessageId: string;
}

function toAssistantConversation(c: ApiConversation): AssistantConversation {
  return {
    id: c.id,
    type: 'assistant',
    title: c.title ?? 'New conversation',
    lastMessageAt: c.updatedAt,
  };
}

export function listAssistantConversations(): Promise<AssistantConversation[]> {
  if (MOCK_API) {
    return Promise.resolve(mockListConversations());
  }
  return request<ApiPage<ApiConversation>>('/assistant/conversations').then((page) =>
    page.items.map(toAssistantConversation),
  );
}

export async function createAssistantConversation(): Promise<AssistantConversation> {
  if (MOCK_API) {
    return mockCreateConversation();
  }
  // `start` returns only the id; fetch the full record so the UI has a title.
  const { conversationId } = await request<StartConversationResult>('/assistant/conversations', {
    method: 'POST',
    body: {},
  });
  const conversation = await request<ApiConversation>(
    `/assistant/conversations/${conversationId}`,
  );
  return toAssistantConversation(conversation);
}

export function renameAssistantConversation(
  conversationId: string,
  title: string,
): Promise<AssistantConversation> {
  if (MOCK_API) {
    return Promise.resolve(mockRenameConversation(conversationId, title));
  }
  return request<ApiConversation>(`/assistant/conversations/${conversationId}`, {
    method: 'PATCH',
    body: { title },
  }).then(toAssistantConversation);
}

export function deleteAssistantConversation(conversationId: string): Promise<void> {
  if (MOCK_API) {
    mockDeleteConversation(conversationId);
    return Promise.resolve();
  }
  return request<{ deleted: true }>(`/assistant/conversations/${conversationId}`, {
    method: 'DELETE',
  }).then(() => undefined);
}

export function listAssistantTurns(conversationId: string): Promise<AssistantTurn[]> {
  if (MOCK_API) {
    return Promise.resolve(mockListTurns(conversationId));
  }
  return request<ApiPage<ApiMessage>>(
    `/assistant/conversations/${conversationId}/messages?order=asc`,
  ).then((page) =>
    page.items
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as AssistantTurn['role'],
        text: m.content,
        createdAt: m.createdAt,
      })),
  );
}

/**
 * Send one turn. Resolves with the assistant's reply (synchronous on the
 * backend); live agent progress arrives separately over the workflow SSE.
 */
export function postAssistantMessage(
  conversationId: string,
  text: string,
  signal?: AbortSignal,
): Promise<AssistantTurn> {
  if (MOCK_API) {
    return Promise.resolve(mockPostMessage(conversationId, text));
  }
  const path = `/assistant/conversations/${conversationId}/messages`;
  const result =
    signal !== undefined
      ? request<AssistantTurnOutcome>(path, { method: 'POST', body: { message: text }, signal })
      : request<AssistantTurnOutcome>(path, { method: 'POST', body: { message: text } });
  return result.then((outcome) => ({
    id: outcome.assistantMessageId,
    conversationId: outcome.conversationId,
    role: 'assistant',
    text: outcome.reply,
    createdAt: new Date().toISOString(),
  }));
}
