import { request } from '@/shared/api/httpClient';
import { MOCK_API } from '@/shared/config';
import type {
  AssistantConversation,
  AssistantTurn,
  AssistantTurnResult,
  ConversationMode,
  MessageMeta,
  PipelineRunResult,
} from '../types/assistant';
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
// Source: agents/conversation/domain/conversation.model.ts.
interface ApiConversation {
  id: string;
  title: string | null;
  updatedAt: string;
  mode: ConversationMode;
  origin: 'user' | 'system';
  attention: boolean;
  pendingCardBatchId: string | null;
  purpose: 'program_build' | null;
  buildContext: { programId: string; weekIndex: number } | null;
}

interface ApiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta: MessageMeta | null;
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
// Source: assistant.service.ts AssistantTurnOutcome.
interface AssistantTurnOutcome {
  lane: 'white' | 'black' | 'gray';
  reply: string;
  capturedCount: number;
  inferred: boolean;
  awaitingConfirmation: boolean;
  intentBlocked: boolean;
  pipelineRun: PipelineRunResult | null;
  conversationId: string;
  assistantMessageId: string;
}

function toAssistantConversation(c: ApiConversation): AssistantConversation {
  return {
    id: c.id,
    type: 'assistant',
    title: c.title ?? 'New conversation',
    lastMessageAt: c.updatedAt,
    mode: c.mode,
    origin: c.origin,
    attention: c.attention,
    pendingCardBatchId: c.pendingCardBatchId,
    purpose: c.purpose ?? null,
    buildContext: c.buildContext ?? null,
  };
}

// Map a synchronous turn outcome (POST .../messages | confirm-slot | resume) onto
// the chat surface's AssistantTurnResult. The slotProposal/buildRetry meta is NOT
// on this body — it lives on the persisted message, so build callers refetch the
// transcript after the turn to read it.
function toTurnResult(outcome: AssistantTurnOutcome): AssistantTurnResult {
  return {
    turn: {
      id: outcome.assistantMessageId,
      conversationId: outcome.conversationId,
      role: 'assistant' as const,
      text: outcome.reply,
      createdAt: new Date().toISOString(),
      meta: {
        lane: outcome.lane,
        awaitingConfirmation: outcome.awaitingConfirmation,
      },
    },
    conversationId: outcome.conversationId,
    intentBlocked: outcome.intentBlocked,
    awaitingConfirmation: outcome.awaitingConfirmation,
    pipelineRun: outcome.pipelineRun,
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

export function getAssistantConversation(
  conversationId: string,
): Promise<AssistantConversation> {
  if (MOCK_API) {
    return Promise.resolve(
      mockListConversations().find((c) => c.id === conversationId) ?? mockCreateConversation(),
    );
  }
  return request<ApiConversation>(`/assistant/conversations/${conversationId}`).then(
    toAssistantConversation,
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
  return getAssistantConversation(conversationId);
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

// PATCH /assistant/conversations/:id/mode — flip Plan/Ask. Returns the updated
// conversation so the UI can reflect the authoritative mode.
export function setAssistantConversationMode(
  conversationId: string,
  mode: ConversationMode,
): Promise<AssistantConversation> {
  if (MOCK_API) {
    return Promise.resolve({
      ...(mockListConversations().find((c) => c.id === conversationId) ?? mockCreateConversation()),
      mode,
    });
  }
  return request<ApiConversation>(`/assistant/conversations/${conversationId}/mode`, {
    method: 'PATCH',
    body: { mode },
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

// POST /assistant/conversations/:id/close — end the session; fires the staging
// buffer flush server-side. Best-effort: callers ignore failures.
export function closeAssistantConversation(conversationId: string): Promise<void> {
  if (MOCK_API) {
    return Promise.resolve();
  }
  return request<{ closed: true }>(`/assistant/conversations/${conversationId}/close`, {
    method: 'POST',
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
        meta: m.meta,
      })),
  );
}

/**
 * Send one turn. Resolves with the assistant's reply plus the turn-level signals
 * the chat surface branches on (a fired pipeline, an Ask-mode intent block, an
 * awaiting-confirmation question). The reply is synchronous on the backend; live
 * agent progress arrives separately over the workflow SSE.
 */
export function postAssistantMessage(
  conversationId: string,
  text: string,
  signal?: AbortSignal,
): Promise<AssistantTurnResult> {
  if (MOCK_API) {
    return Promise.resolve(mockPostMessage(conversationId, text)).then((turn) => ({
      turn,
      conversationId: turn.conversationId,
      intentBlocked: false,
      awaitingConfirmation: false,
      pipelineRun: null,
    }));
  }
  const path = `/assistant/conversations/${conversationId}/messages`;
  const result =
    signal !== undefined
      ? request<AssistantTurnOutcome>(path, { method: 'POST', body: { message: text }, signal })
      : request<AssistantTurnOutcome>(path, { method: 'POST', body: { message: text } });
  return result.then(toTurnResult);
}

// GET /assistant/conversations/build — the in-flight program_build chat opened by
// the onboarding handoff, or null when none is underway. The onboarding finish
// step polls this to discover the conversation and navigate the user into it.
// Build is backend-driven (no mock) — under MOCK_API there's nothing to find.
export function getBuildConversation(): Promise<AssistantConversation | null> {
  if (MOCK_API) {
    return Promise.resolve(null);
  }
  return request<{ conversation: ApiConversation | null }>(
    '/assistant/conversations/build',
  ).then((res) => (res.conversation ? toAssistantConversation(res.conversation) : null));
}

// POST /assistant/conversations/:id/confirm-slot — confirm the user's slot pick on
// a program_build chat. Re-validates + schedules + advances the build server-side,
// returning the next turn (which may carry the next slotProposal, on the message).
export function confirmBuildSlot(
  conversationId: string,
  scheduledStartUtc: string,
): Promise<AssistantTurnResult> {
  return request<AssistantTurnOutcome>(
    `/assistant/conversations/${conversationId}/confirm-slot`,
    { method: 'POST', body: { scheduledStartUtc } },
  ).then(toTurnResult);
}

// POST /assistant/conversations/:id/resume — re-greet an in-flight build on reopen.
// The server derives the live phase; it only posts when the build sits on an
// unperformed step. Null `outcome` means nothing was posted (just render the
// transcript). Build is backend-driven, so this is a no-op under MOCK_API.
export function resumeBuild(
  conversationId: string,
): Promise<AssistantTurnResult | null> {
  if (MOCK_API) {
    return Promise.resolve(null);
  }
  return request<{ outcome: AssistantTurnOutcome | null }>(
    `/assistant/conversations/${conversationId}/resume`,
    { method: 'POST', body: {} },
  ).then((res) => (res.outcome ? toTurnResult(res.outcome) : null));
}
