import { z } from 'zod';

/**
 * A tool an agent can call inside its bounded loop. Two flavours:
 *  - READ tools (`terminal: false`) fetch more context on demand; the loop
 *    feeds their result back to the model and continues.
 *  - WRITE tools (`terminal: true`) are the explicit, single exit of the loop:
 *    the first successful terminal call produces the agent's output and stops
 *    iteration. This is how "autonomy without unbounded cost" is enforced.
 *
 * The Zod `schema` is the single contract — it generates the model-facing JSON
 * Schema AND validates arguments before the handler ever runs.
 */
export interface AgentTool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TArgs>;
  /** True = calling this ends the loop with its result as the agent output. */
  terminal: boolean;
  handler: (args: TArgs, ctx: AgentToolContext) => Promise<TResult>;
}

/** Per-run context threaded into every tool handler (who/when, for scoping). */
export interface AgentToolContext {
  userId: string;
  /** Stable id for the orchestrator run, for idempotency + correlation. */
  runId: string;
}

/**
 * A tool of any argument/result shape. Needed at collection/boundary points:
 * `AgentTool<TArgs>` is contravariant in its handler arg, so a narrow tool does
 * NOT widen to `AgentTool<unknown>`. Registries and the loop runtime operate
 * over heterogeneous tools, so they use this alias; per-tool typing is still
 * preserved inside each `defineTool` call (args are validated by Zod at runtime).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentTool = AgentTool<any, any>;

/** Helper to declare a tool with inferred argument typing. */
export function defineTool<TArgs, TResult>(
  tool: AgentTool<TArgs, TResult>,
): AgentTool<TArgs, TResult> {
  return tool;
}
