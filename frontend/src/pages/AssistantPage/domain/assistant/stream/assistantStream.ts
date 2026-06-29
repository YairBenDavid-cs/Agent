// The SSE wire contract for the live agent-progress feed, mirrored from the
// backend's WorkflowStreamController. A single user-wide stream emits `workflow`
// events ("Coach is evaluating your week…") while a turn runs; the assistant
// reply itself comes back synchronously from POST .../messages, not over SSE.
export interface WorkflowEventData {
  agentName: string;
  phase: string;
  detail?: string;
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
