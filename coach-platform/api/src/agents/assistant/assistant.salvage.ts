import { AssistantTurn, assistantTurnSchema } from './assistant.contracts';

/**
 * Recovery for the degraded path: when the model answers in free text instead
 * of calling `assistant_turn`, it sometimes EMULATES the tool by emitting the
 * structured output as a JSON code block in its prose. Left untouched, that raw
 * `{ "lane": ..., "reply": ... }` blob leaks into the user-facing message.
 *
 * These pure helpers salvage that case: parse an embedded structured turn back
 * out (so we recover the real reply AND any captured signals and run them
 * through the normal `decideActions` path), or — when nothing valid is found —
 * strip the JSON artifacts so we never persist a raw blob.
 */

const FENCE = /```(?:json)?\s*([\s\S]*?)```/gi;

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Yield candidate JSON values found in `text`: first every fenced code block,
 * then the widest bare `{...}` span (covers JSON emitted without a fence).
 */
function* jsonCandidates(text: string): Generator<unknown> {
  FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE.exec(text)) !== null) {
    const value = tryParse(match[1].trim());
    if (value !== undefined) yield value;
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const value = tryParse(text.slice(first, last + 1));
    if (value !== undefined) yield value;
  }
}

/**
 * Try to recover a valid `AssistantTurn` embedded as JSON in free-text output.
 * Returns the validated turn, or null when no candidate satisfies the schema.
 */
export function salvageAssistantTurn(text: string | null): AssistantTurn | null {
  if (!text) return null;
  for (const candidate of jsonCandidates(text)) {
    const parsed = assistantTurnSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/**
 * Last resort when salvage fails: remove fenced code blocks (and a remainder
 * that is nothing but a bare JSON object) so the user never sees a raw blob.
 * Plain prose with no structured artifacts is returned unchanged.
 */
export function stripStructuredArtifacts(text: string | null): string {
  if (!text) return '';
  let out = text.replace(FENCE, '').trim();
  if (out.startsWith('{') && out.endsWith('}') && tryParse(out) !== undefined) {
    out = '';
  }
  return out.trim();
}
