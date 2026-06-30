// The SSE wire contract for the live agent stream, mirrored from the backend's
// WorkflowStreamController. The single user-wide stream is MULTIPLEXED — branch
// on the SSE event name:
//  - `workflow`     — agent-progress beats ("Coach is evaluating your week…")
//                     while a turn runs; the reply itself comes back from POST.
//  - `conversation` — a trigger proactively opened a chat for the user (e.g. the
//                     outcome-clarify path), so the UI can surface the
//                     pinned/flagged conversation without polling.
export interface WorkflowEventData {
  agentName: string;
  phase: string;
  detail?: string;
  at: string;
}

export interface ConversationEventData {
  conversationId: string;
  title: string | null;
  origin: 'user' | 'system';
  attention: boolean;
  at: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Auth rides in the httpOnly cookie: the EventSource is opened with
// `withCredentials: true`, so no token appears in the URL. The stream is scoped
// to the authenticated user server-side, so no conversation id is needed.
export function assistantStreamUrl(): string {
  return `${BASE_URL}/assistant/stream`;
}

export function parseWorkflowEvent(raw: string): WorkflowEventData | null {
  const data: unknown = safeParse(raw);
  if (isRecord(data) && typeof data.agentName === 'string' && typeof data.phase === 'string') {
    const event: WorkflowEventData = {
      agentName: data.agentName,
      phase: data.phase,
      at: typeof data.at === 'string' ? data.at : '',
    };
    if (typeof data.detail === 'string') {
      event.detail = data.detail;
    }
    return event;
  }
  return null;
}

export function parseConversationEvent(raw: string): ConversationEventData | null {
  const data: unknown = safeParse(raw);
  if (isRecord(data) && typeof data.conversationId === 'string') {
    return {
      conversationId: data.conversationId,
      title: typeof data.title === 'string' ? data.title : null,
      origin: data.origin === 'system' ? 'system' : 'user',
      attention: data.attention === true,
      at: typeof data.at === 'string' ? data.at : '',
    };
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
