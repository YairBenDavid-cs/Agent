import { z } from 'zod';
import { defineTool } from '../agent-tool';
import { AgenticLoopRuntime } from '../agentic-loop.runtime';
import { LlmCompletion } from '../llm.types';

const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };

function makeRuntime(completions: LlmCompletion[]) {
  let i = 0;
  const llm = {
    complete: jest.fn(() => Promise.resolve(completions[i++])),
  };
  const emitWorkflow = jest.fn();
  const telemetry = { emitWorkflow, recordLlmCall: jest.fn() };
  const runtime = new AgenticLoopRuntime(llm as never, telemetry as never);
  return { runtime, emitWorkflow, llm };
}

const terminalTool = () =>
  defineTool<{ ok: boolean }, { ok: boolean }>({
    name: 'emit',
    description: 'terminal',
    schema: z.object({ ok: z.boolean() }),
    terminal: true,
    handler: (args) => Promise.resolve(args),
  });

describe('AgenticLoopRuntime workflow telemetry', () => {
  it('emits started then completed (with tool name) on a terminal tool call', async () => {
    const { runtime, emitWorkflow } = makeRuntime([
      {
        message: {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 't1', name: 'emit', argumentsJson: '{"ok":true}' }],
        },
        usage,
        finishReason: 'tool_calls',
      },
    ]);

    const res = await runtime.run({
      agentName: 'coach',
      systemPrompt: 'sys',
      seedMessage: 'seed',
      tools: [terminalTool()],
      ctx: { userId: 'user-1', runId: 'run-1' },
    });

    expect(res.terminalResult).toEqual({ ok: true });
    expect(emitWorkflow.mock.calls).toEqual([
      ['user-1', 'coach', 'started'],
      ['user-1', 'coach', 'completed', 'emit'],
    ]);
  });

  it('emits started then completed when the model answers in free text', async () => {
    const { runtime, emitWorkflow } = makeRuntime([
      {
        message: { role: 'assistant', content: 'here you go' },
        usage,
        finishReason: 'stop',
      },
    ]);

    const res = await runtime.run({
      agentName: 'assistant',
      systemPrompt: 'sys',
      seedMessage: 'seed',
      tools: [terminalTool()],
      ctx: { userId: 'user-2', runId: 'run-2' },
    });

    expect(res.finalText).toBe('here you go');
    expect(emitWorkflow.mock.calls).toEqual([
      ['user-2', 'assistant', 'started'],
      ['user-2', 'assistant', 'completed'],
    ]);
  });

  it('threads history between the system prompt and the seed message', async () => {
    const { runtime, llm } = makeRuntime([
      {
        message: { role: 'assistant', content: 'ok' },
        usage,
        finishReason: 'stop',
      },
    ]);

    await runtime.run({
      agentName: 'assistant',
      systemPrompt: 'sys',
      seedMessage: 'seed',
      history: [
        { role: 'system', content: 'summary' },
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
      ],
      tools: [terminalTool()],
      ctx: { userId: 'user-h', runId: 'run-h' },
    });

    const firstCall = llm.complete.mock.calls[0] as unknown as Array<{
      messages: { role: string; content: string }[];
    }>;
    // The loop mutates this same array (appends the response), so assert on the
    // prefix it was seeded with.
    const sentMessages = firstCall[0].messages.slice(0, 5);
    expect(sentMessages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(sentMessages[0].content).toBe('sys');
    expect(sentMessages[1].content).toBe('summary');
    expect(sentMessages[4].content).toBe('seed');
  });

  it('coerces the terminal tool when the model first answers in free text', async () => {
    const { runtime, llm } = makeRuntime([
      // Turn 1: model emulates the tool as a JSON code block in prose.
      {
        message: {
          role: 'assistant',
          content: '```json\n{"ok":true}\n```',
        },
        usage,
        finishReason: 'stop',
      },
      // Turn 2 (forced): a real terminal tool call.
      {
        message: {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 't1', name: 'emit', argumentsJson: '{"ok":true}' }],
        },
        usage,
        finishReason: 'tool_calls',
      },
    ]);

    const res = await runtime.run({
      agentName: 'assistant',
      systemPrompt: 'sys',
      seedMessage: 'seed',
      tools: [terminalTool()],
      ctx: { userId: 'user-c', runId: 'run-c' },
      coerceTerminalTool: true,
    });

    expect(res.terminalResult).toEqual({ ok: true });
    expect(res.iterations).toBe(2);
    // First call is unforced; the retry forces the single terminal tool.
    const calls = llm.complete.mock.calls as unknown as Array<
      [{ forceTool?: string }]
    >;
    expect(calls[0][0].forceTool).toBeUndefined();
    expect(calls[1][0].forceTool).toBe('emit');
  });

  it('coerces at most once, then falls back to free text', async () => {
    const freeText: LlmCompletion = {
      message: { role: 'assistant', content: 'still prose' },
      usage,
      finishReason: 'stop',
    };
    const { runtime, llm } = makeRuntime([freeText, freeText]);

    const res = await runtime.run({
      agentName: 'assistant',
      systemPrompt: 'sys',
      seedMessage: 'seed',
      tools: [terminalTool()],
      ctx: { userId: 'user-c2', runId: 'run-c2' },
      coerceTerminalTool: true,
    });

    expect(res.finalText).toBe('still prose');
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });

  it('emits started then exhausted when the iteration cap is hit', async () => {
    const loopingCompletion: LlmCompletion = {
      message: {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'r', name: 'unknown_tool', argumentsJson: '{}' }],
      },
      usage,
      finishReason: 'tool_calls',
    };
    const { runtime, emitWorkflow } = makeRuntime(
      Array(3).fill(loopingCompletion),
    );

    const res = await runtime.run({
      agentName: 'planner',
      systemPrompt: 'sys',
      seedMessage: 'seed',
      tools: [terminalTool()],
      ctx: { userId: 'user-3', runId: 'run-3' },
      maxIterations: 3,
    });

    expect(res.exhausted).toBe(true);
    expect(emitWorkflow.mock.calls).toEqual([
      ['user-3', 'planner', 'started'],
      ['user-3', 'planner', 'exhausted'],
    ]);
  });
});
