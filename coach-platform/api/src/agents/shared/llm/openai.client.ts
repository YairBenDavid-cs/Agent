import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { AgentTelemetryService } from './agent-telemetry.service';
import {
  LlmCompleteParams,
  LlmCompletion,
  LlmMessage,
  LlmToolCall,
} from './llm.types';

/**
 * Thin, provider-specific wrapper over OpenAI chat-completions with tool calling.
 * One concern only: translate our framework-free `LlmMessage`/`LlmToolSpec`
 * shapes to/from the SDK and record telemetry. All loop/orchestration logic
 * lives in `AgenticLoopRuntime`; all schema/contract logic in structured-output.
 *
 * Lazily constructs the SDK client so the API still boots when OPENAI_API_KEY is
 * absent — only an actual agent call fails (503), never startup.
 */
@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger('OpenAiClient');
  private client: OpenAI | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly telemetry: AgentTelemetryService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('openaiApiKey'));
  }

  private get sdk(): OpenAI {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('OPENAI_NOT_CONFIGURED');
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.get<string>('openaiApiKey'),
      });
    }
    return this.client;
  }

  private get defaultModel(): string {
    return this.config.get<string>('openaiModel') ?? 'gpt-5.1';
  }

  async complete(params: LlmCompleteParams): Promise<LlmCompletion> {
    const model = params.model ?? this.defaultModel;
    const tools = params.tools?.map(toSdkTool);
    const startedAt = Date.now();

    const response = await this.sdk.chat.completions.create({
      model,
      temperature: params.temperature ?? 0.4,
      messages: params.messages.map(toSdkMessage),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(params.forceTool
        ? {
            tool_choice: {
              type: 'function' as const,
              function: { name: params.forceTool },
            },
          }
        : {}),
    });

    const durationMs = Date.now() - startedAt;
    const choice = response.choices[0];
    const message = fromSdkMessage(choice.message);
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    this.telemetry.recordLlmCall({
      agentName: params.agentName,
      model,
      usage,
      durationMs,
      toolCalls: (message.toolCalls ?? []).map((t) => t.name),
      at: new Date().toISOString(),
    });

    return {
      message,
      usage,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }
}

function toSdkTool(spec: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  };
}

function toSdkMessage(msg: LlmMessage): ChatCompletionMessageParam {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: msg.content ?? '' };
    case 'user':
      return { role: 'user', content: msg.content ?? '' };
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId ?? '',
        content: msg.content ?? '',
      };
    case 'assistant':
      return {
        role: 'assistant',
        content: msg.content,
        ...(msg.toolCalls && msg.toolCalls.length > 0
          ? {
              tool_calls: msg.toolCalls.map((t) => ({
                id: t.id,
                type: 'function' as const,
                function: { name: t.name, arguments: t.argumentsJson },
              })),
            }
          : {}),
      };
  }
}

function fromSdkMessage(message: {
  content: string | null;
  tool_calls?: Array<
    | { id: string; type: 'function'; function: { name: string; arguments: string } }
    | { id: string; type: string }
  >;
}): LlmMessage {
  // The SDK union includes custom (non-function) tool calls; we only ever
  // declare function tools, so keep just those.
  const toolCalls: LlmToolCall[] | undefined = message.tool_calls
    ?.filter(
      (t): t is { id: string; type: 'function'; function: { name: string; arguments: string } } =>
        t.type === 'function' && 'function' in t,
    )
    .map((t) => ({
      id: t.id,
      name: t.function.name,
      argumentsJson: t.function.arguments,
    }));
  return {
    role: 'assistant',
    content: message.content,
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  };
}
