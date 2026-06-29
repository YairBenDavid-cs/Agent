// The SSE wire contract, mirrored from the backend's Zod schema in
// sse-event.ts. Named events: `token`, `done`, `error`, `tool`.
export interface TokenEventData {
  delta: string;
}

export interface ToolEventData {
  name: string;
  phase: 'start' | 'end';
}

export interface TitleEventData {
  title: string;
}

export interface DoneEventData {
  messageId: string;
  finishReason: string;
}

export interface AssistantErrorEventData {
  code: string;
  message: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Auth rides in the httpOnly cookie: the EventSource is opened with
// `withCredentials: true`, so no token appears in the URL.
// The backend streams workflow-progress beats per user (not per conversation),
// so the path is /assistant/stream with no conversation ID in the URL.
export function assistantStreamUrl(_conversationId: string): string {
  return `${BASE_URL}/assistant/stream`;
}

export function parseTokenEvent(raw: string): TokenEventData | null {
  const data: unknown = safeParse(raw);
  if (isRecord(data) && typeof data.delta === 'string') {
    return { delta: data.delta };
  }
  return null;
}

export function parseDoneEvent(raw: string): DoneEventData | null {
  const data: unknown = safeParse(raw);
  if (isRecord(data) && typeof data.messageId === 'string' && typeof data.finishReason === 'string') {
    return { messageId: data.messageId, finishReason: data.finishReason };
  }
  return null;
}

export function parseErrorEvent(raw: string): AssistantErrorEventData | null {
  const data: unknown = safeParse(raw);
  if (isRecord(data) && typeof data.code === 'string' && typeof data.message === 'string') {
    return { code: data.code, message: data.message };
  }
  return null;
}

export function parseToolEvent(raw: string): ToolEventData | null {
  const data: unknown = safeParse(raw);
  if (
    isRecord(data) &&
    typeof data.name === 'string' &&
    (data.phase === 'start' || data.phase === 'end')
  ) {
    return { name: data.name, phase: data.phase };
  }
  return null;
}

export function parseTitleEvent(raw: string): TitleEventData | null {
  const data: unknown = safeParse(raw);
  if (isRecord(data) && typeof data.title === 'string') {
    return { title: data.title };
  }
  return null;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
