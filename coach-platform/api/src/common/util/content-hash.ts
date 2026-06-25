import { createHash } from 'crypto';

/**
 * Deterministic SHA-256 over a value's stable JSON form. Used as the idempotency
 * guard for daily snapshots: identical content => identical hash => skip write
 * (the OpenClaw delta-sync idea applied to structured data).
 *
 * Keys are sorted so logically-equal objects hash identically regardless of
 * field insertion order.
 */
export const contentHash = (value: unknown): string =>
  createHash('sha256').update(stableStringify(value)).digest('hex');

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, unknown>)[key],
        )}`,
    );
  return `{${entries.join(',')}}`;
};
