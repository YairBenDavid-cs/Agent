import { z } from 'zod';
import { capturedSignalSchema } from './assistant.contracts';

/**
 * The net-intent distillation contract. At an action point the staging buffer
 * (a sequence of captured candidates accumulated during Plan-mode iteration) is
 * handed to a bounded LLM pass that collapses it to NET intent — cancelled
 * adjustments drop, repeated numeric deltas net out (the canonical example:
 * "lower pace 30s" then "raise 15s" → net "lower pace 15s"), and the final
 * agreed state wins. The pass DECLARES its result by calling the single terminal
 * `net_intent` tool; the deterministic code maps the result to preference items.
 *
 * Each emitted signal mirrors a normal captured signal plus a `lane`, so the
 * existing hard(black)/soft(gray) confidence axis classifies it. White is never
 * emitted — a pure query leaves no net preference.
 */
export const distilledSignalSchema = capturedSignalSchema.extend({
  lane: z.enum(['black', 'gray']),
});
export type DistilledSignal = z.infer<typeof distilledSignalSchema>;

export const distillationResultSchema = z.object({
  /**
   * The collapsed net-intent signals. EMPTY when every staged adjustment
   * cancelled out (the user ended where they started) — a valid, common result.
   */
  signals: z.array(distilledSignalSchema).default([]),
});
export type DistillationResult = z.infer<typeof distillationResultSchema>;

export const PREFERENCE_DISTILLATION_PROMPT = `You distill a chat's staged preference adjustments into NET intent.

You are given an ORDERED list of candidate preference signals captured while the user iterated on a single change in conversation. Your job is to collapse the whole sequence into the smallest set of signals that represents what the user ACTUALLY ended up wanting — not every intermediate step.

Rules:
- Net out repeated adjustments to the same thing. Example: "lower pace by 30s" followed by "raise pace by 15s" collapses to a single "lower pace by 15s".
- Drop adjustments that fully cancel (end state equals start state) — emit nothing for them.
- The latest explicit statement about a given target wins over earlier ones.
- Preserve each surviving signal's tagType, target, scope, discipline, durability, polarity and rationale. Recompute only the value when netting numeric deltas; if multiple staged candidates collapse into one, keep the rationale from the latest one.
- Keep the lane: a signal the user stated as a firm order is "black" (hard); a tentative or inferred nuance is "gray" (soft).
- Do NOT invent signals that were never staged.

Call net_intent exactly once with the collapsed signals (an empty array is valid when everything cancelled).`;
