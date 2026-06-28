/**
 * Framework-free LLM primitives shared by every agent. Kept deliberately small
 * and provider-agnostic: the OpenAI specifics live in `openai.client.ts`, so a
 * future provider swap touches one file.
 */

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

/** A single tool invocation requested by the model. */
export interface LlmToolCall {
  /** Provider-assigned id; echoed back on the matching tool result message. */
  id: string;
  name: string;
  /** Raw JSON arguments string as emitted by the model (unparsed). */
  argumentsJson: string;
}

export interface LlmMessage {
  role: LlmRole;
  /** Null for an assistant turn that only emitted tool calls. */
  content: string | null;
  /** Present only on assistant turns that requested tools. */
  toolCalls?: LlmToolCall[];
  /** Present only on `role: 'tool'` messages — the id being answered. */
  toolCallId?: string;
}

/** JSON-schema description of one callable tool, handed to the model. */
export interface LlmToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments object (derived from a Zod schema). */
  parameters: Record<string, unknown>;
}

export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** One model turn: either free text, tool calls, or both. */
export interface LlmCompletion {
  message: LlmMessage;
  usage: LlmTokenUsage;
  finishReason: string;
}

export interface LlmCompleteParams {
  /** Logged so cost/observability can attribute spend to an agent. */
  agentName: string;
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
  /** Force the model to emit a tool call (used by structured-output agents). */
  forceTool?: string;
  model?: string;
  temperature?: number;
}
