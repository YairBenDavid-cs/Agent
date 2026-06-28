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
