/**
 * Pure dedup for the session-flush (durable-memory) trigger. At conversation
 * teardown the assistant scans for NEW inferred signals. A signal already
 * eager-written as an explicit event THIS session must not be re-appended as an
 * inferred duplicate — otherwise one chat would double-count toward the
 * reinforcement threshold. We dedupe on the signal's identity (tag type + value
 * + target), not on object identity.
 */

export interface FlushSignalLike {
  tag: { type: string; value?: string | number | null };
  target?: {
    plannedSessionId?: string | null;
    exerciseId?: string | null;
    runType?: string | null;
  } | null;
}

/** Stable identity key for a signal, independent of confidence/durability. */
export function flushSignalKey(signal: FlushSignalLike): string {
  const t = signal.target ?? {};
  const target = [
    t.plannedSessionId ?? '',
    t.exerciseId ?? '',
    t.runType ?? '',
  ].join('|');
  return `${signal.tag.type}|${signal.tag.value ?? ''}|${target}`;
}

/**
 * Keep only extracted signals whose identity was NOT already captured this
 * session, AND drop intra-batch duplicates (first occurrence wins).
 */
export function dedupeFlushSignals<T extends FlushSignalLike>(
  extracted: T[],
  alreadyCapturedKeys: Iterable<string>,
): T[] {
  const seen = new Set<string>(alreadyCapturedKeys);
  const out: T[] = [];
  for (const signal of extracted) {
    const key = flushSignalKey(signal);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(signal);
  }
  return out;
}
