import { Injectable, Logger } from '@nestjs/common';
import { AgentToolContext, AnyAgentTool } from './agent-tool';
import { AgentTelemetryService } from './agent-telemetry.service';
import { OpenAiClient } from './openai.client';
import { LlmMessage, LlmToolSpec } from './llm.types';
import { buildToolSpec, parseToolArguments } from '../structured-output/zod-tool';

export interface AgenticLoopParams {
  agentName: string;
  /** Stable instruction layer (kept free of dynamic data for cacheability). */
  systemPrompt: string;
  /** The curated context slice — common case needs zero read-tool calls. */
  seedMessage: string;
  tools: AnyAgentTool[];
  ctx: AgentToolContext;
  /**
   * Prior conversation turns (rolling summary + recent verbatim messages),
   * threaded between the stable system prompt and the curated seed+message so a
   * multi-turn chat stays coherent. Empty for one-shot specialist runs.
   */
  history?: LlmMessage[];
  /** Hard cap on model turns (autonomy bound). Defaults to 8. */
  maxIterations?: number;
  model?: string;
  temperature?: number;
  /**
   * When true and the model answers in free text instead of calling the loop's
   * single terminal tool, retry ONCE forcing that tool (`tool_choice`). This
   * stops weaker turns (e.g. a trivial greeting) from emulating the structured
   * output as a JSON code block in prose. Opt-in: only the structured-reply
   * agents that show `finalText` to a user need it. No-op unless EXACTLY one
   * terminal tool is registered.
   */
  coerceTerminalTool?: boolean;
}

export interface AgenticLoopResult<T = unknown> {
  /** Result of the terminal write tool, if one was called. */
  terminalResult: T | null;
  /** Name of the terminal tool that ended the loop, if any. */
  terminalTool: string | null;
  /** Free-text answer when the loop ended without a terminal tool. */
  finalText: string | null;
  iterations: number;
  /** True if the loop hit maxIterations without a terminal tool / final text. */
  exhausted: boolean;
}

const DEFAULT_MAX_ITERATIONS = 8;

/**
 * Runs a specialist as a bounded tool-using loop. Pre-seeds a curated context
 * so the common case completes in one turn; read tools fetch more on demand;
 * the first successful TERMINAL tool call is the single, explicit exit.
 *
 * Validator-bounce: when a tool's arguments fail Zod validation (or its handler
 * throws), the error is fed back as the tool result so the model can correct
 * itself on the next turn — within the iteration cap. This is the in-loop half
 * of defense-in-depth; agent-specific guardrails wrap the terminal handler.
 */
@Injectable()
export class AgenticLoopRuntime {
  private readonly logger = new Logger('AgenticLoop');

  constructor(
    private readonly llm: OpenAiClient,
    private readonly telemetry: AgentTelemetryService,
  ) {}

  async run<T = unknown>(
    params: AgenticLoopParams,
  ): Promise<AgenticLoopResult<T>> {
    const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const toolsByName = new Map(params.tools.map((t) => [t.name, t]));
    const toolSpecs: LlmToolSpec[] = params.tools.map((t) =>
      buildToolSpec(t.name, t.description, t.schema),
    );

    // User-facing progress beat ("Coach is evaluating your week…"). Never
    // carries token counts — those stay in the per-call backend record.
    this.telemetry.emitWorkflow(params.ctx.userId, params.agentName, 'started');

    const messages: LlmMessage[] = [
      { role: 'system', content: params.systemPrompt },
      ...(params.history ?? []),
      { role: 'user', content: params.seedMessage },
    ];

    // Set on a turn to force the model to call a specific tool on the NEXT
    // completion; consumed (cleared) immediately after that call is issued.
    let forceTool: string | undefined;
    // Tracks whether we've already spent our one terminal-tool coercion retry.
    let coerced = false;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const completion = await this.llm.complete({
        agentName: params.agentName,
        messages,
        tools: toolSpecs,
        model: params.model,
        temperature: params.temperature,
        forceTool,
      });
      forceTool = undefined;
      const assistant = completion.message;
      messages.push(assistant);

      const toolCalls = assistant.toolCalls ?? [];
      if (toolCalls.length === 0) {
        // No tool requested — the model is answering in free text. If asked to,
        // retry ONCE forcing the single terminal tool so the structured output
        // comes back as a real tool call instead of JSON-in-prose.
        if (params.coerceTerminalTool && !coerced) {
          const terminals = params.tools.filter((t) => t.terminal);
          if (terminals.length === 1) {
            coerced = true;
            forceTool = terminals[0].name;
            this.logger.warn(
              `${params.agentName} answered in free text; forcing ${terminals[0].name}.`,
            );
            continue;
          }
        }
        this.telemetry.emitWorkflow(
          params.ctx.userId,
          params.agentName,
          'completed',
        );
        return {
          terminalResult: null,
          terminalTool: null,
          finalText: assistant.content,
          iterations: iteration,
          exhausted: false,
        };
      }

      // Dispatch every requested tool, appending a result message for each.
      for (const call of toolCalls) {
        const tool = toolsByName.get(call.name);
        if (!tool) {
          messages.push(
            this.toolResult(call.id, `Unknown tool "${call.name}".`),
          );
          continue;
        }

        const parsed = parseToolArguments(tool.schema, call.argumentsJson);
        if (!parsed.ok) {
          messages.push(
            this.toolResult(
              call.id,
              `Invalid arguments: ${parsed.error}. Please correct and retry.`,
            ),
          );
          continue;
        }

        // User-facing beat for the tool about to run (read tools + delegation
        // tools). Terminal tools emit their own 'completed' beat below, so skip
        // them here to avoid a redundant beat right before completion.
        if (!tool.terminal) {
          this.telemetry.emitWorkflow(
            params.ctx.userId,
            params.agentName,
            'tool',
            tool.name,
          );
        }

        let result: unknown;
        try {
          result = await tool.handler(parsed.value, params.ctx);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `${params.agentName} tool ${call.name} failed: ${reason}`,
          );
          messages.push(
            this.toolResult(
              call.id,
              `Tool error: ${reason}. Adjust and retry.`,
            ),
          );
          continue;
        }

        if (tool.terminal) {
          this.telemetry.emitWorkflow(
            params.ctx.userId,
            params.agentName,
            'completed',
            tool.name,
          );
          return {
            terminalResult: result as T,
            terminalTool: tool.name,
            finalText: null,
            iterations: iteration,
            exhausted: false,
          };
        }

        // Read tool: feed the result back and let the model continue.
        messages.push(this.toolResult(call.id, safeStringify(result)));
      }
    }

    this.logger.warn(
      `${params.agentName} exhausted ${maxIterations} iterations without a terminal tool.`,
    );
    this.telemetry.emitWorkflow(
      params.ctx.userId,
      params.agentName,
      'exhausted',
    );
    return {
      terminalResult: null,
      terminalTool: null,
      finalText: null,
      iterations: maxIterations,
      exhausted: true,
    };
  }

  private toolResult(toolCallId: string, content: string): LlmMessage {
    return { role: 'tool', toolCallId, content };
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}
