import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type { AssistantConversation, AssistantTurn } from '../types/assistant';
import {
  mockCreateConversation,
  mockListConversations,
  mockListTurns,
  mockPostMessage,
} from './mockAssistant';

export function listAssistantConversations(): Promise<AssistantConversation[]> {
  if (MOCK_API) {
    return Promise.resolve(mockListConversations());
  }
  return request<AssistantConversation[]>('/conversations?type=assistant');
}

export function createAssistantConversation(): Promise<AssistantConversation> {
  if (MOCK_API) {
    return Promise.resolve(mockCreateConversation());
  }
  return request<AssistantConversation>('/conversations', {
    method: 'POST',
    body: { type: 'assistant' },
  });
}


export function listAssistantTurns(conversationId: string): Promise<AssistantTurn[]> {
  if (MOCK_API) {
    return Promise.resolve(mockListTurns(conversationId));
  }
  return request<AssistantTurn[]>(`/conversations/${conversationId}/messages`);
}

export function postAssistantMessage(conversationId: string, text: string): Promise<AssistantTurn> {
  if (MOCK_API) {
    return Promise.resolve(mockPostMessage(conversationId, text));
  }
  return request<AssistantTurn>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { text },
  });
}
