import { z } from 'zod';
import { LlmToolSpec } from '../llm/llm.types';

/**
 * Bridges Zod schemas to OpenAI tool calling so a tool's contract is declared
 * ONCE (the Zod schema) and reused for: (1) the JSON Schema sent to the model,
 * and (2) strict runtime validation of what comes back. Single source of truth,
 * no hand-written JSON Schema drift.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod v4 ships a native JSON Schema emitter. `io: 'input'` matches what the
  // model is expected to PRODUCE (pre-transform) rather than the parsed output.
  return z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
}

export interface ValidationOk<T> {
  ok: true;
  value: T;
}
export interface ValidationErr {
  ok: false;
  /** Human-readable reason, bounced back into the loop for the model to fix. */
  error: string;
}
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

/** Parse a raw model-emitted JSON arguments string against a Zod schema. */
export function parseToolArguments<T>(
  schema: z.ZodType<T>,
  argumentsJson: string,
): ValidationResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(argumentsJson === '' ? '{}' : argumentsJson);
  } catch {
    return { ok: false, error: 'Arguments were not valid JSON.' };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: formatZodError(result.error) };
  }
  return { ok: true, value: result.data };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/** Convenience: build the model-facing tool spec from name/description/schema. */
export function buildToolSpec(
  name: string,
  description: string,
  schema: z.ZodType,
): LlmToolSpec {
  return { name, description, parameters: toJsonSchema(schema) };
}
