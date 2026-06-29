/**
 * Distilled preference windows for the Coach seed. Replaces the retired
 * revision-history blocks (dual-mode redesign §5/§8): instead of re-joining
 * verbatim card notes to sessions, the Coach reads the user's standing/near-term
 * preference signals split by confidence —
 *
 *   - HARD (explicit)  → near-term guardrail window: honour firmly in the week
 *                        being generated.
 *   - SOFT (inferred)  → long-term bias window: nudge future weeks, never override
 *                        an explicit signal.
 *
 * Net intent is already distilled at capture time (source `chat`), so this is a
 * pure projection of the events the generation context surfaces — no session
 * re-join, no before/after audit.
 */

import {
  PreferenceEvent,
  PreferenceTagType,
  TagPolarity,
} from '../../../personalization/domain/preference-event.model';

/** One preference signal rendered for the Coach, stripped to what it needs. */
export interface PreferenceWindowEntry {
  type: PreferenceTagType;
  polarity: TagPolarity;
  value: string | number | null;
  /** Verbatim user phrasing when present (audit / nuance). */
  note: string;
  eventDate: string;
}

export interface PreferenceWindows {
  /** Explicit signals — honour as guardrails for the upcoming week. */
  nearTerm: PreferenceWindowEntry[];
  /** Inferred signals — gentle long-term bias, never an override. */
  longTerm: PreferenceWindowEntry[];
}

function toEntry(e: PreferenceEvent): PreferenceWindowEntry {
  return {
    type: e.tag.type,
    polarity: e.tag.polarity,
    value: e.tag.value ?? null,
    note: e.rawText.trim(),
    eventDate: e.eventDate,
  };
}

/**
 * Partition the surfaced preference events into the hard (near-term guardrail)
 * and soft (long-term bias) windows by tag confidence. Narrative-only `other`
 * events with no value and no note carry nothing actionable and are dropped.
 * Input order (newest-first from the repo) is preserved within each window.
 */
export function buildPreferenceWindows(
  events: PreferenceEvent[],
): PreferenceWindows {
  const seen = new Set<string>();
  const nearTerm: PreferenceWindowEntry[] = [];
  const longTerm: PreferenceWindowEntry[] = [];

  for (const e of events) {
    const key = e.id ?? `${e.eventDate}|${e.tag.type}|${e.tag.value ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (
      e.tag.type === 'other' &&
      e.tag.value == null &&
      e.rawText.trim().length === 0
    ) {
      continue;
    }

    (e.tag.confidence === 'explicit' ? nearTerm : longTerm).push(toEntry(e));
  }

  return { nearTerm, longTerm };
}

function renderEntry(e: PreferenceWindowEntry): string {
  const value = e.value != null && e.value !== '' ? ` ${e.value}` : '';
  const note = e.note ? ` — "${e.note}"` : '';
  return `- [${e.polarity}] ${e.type}${value}${note}`;
}

/**
 * The Coach-facing preference block: hard signals first (guardrails for the week
 * being built), then soft biases (shape future weeks). Returns null when there
 * is nothing in either window, so the seed renderer can omit it cleanly.
 */
export function renderPreferenceWindows(
  windows: PreferenceWindows,
): string | null {
  if (windows.nearTerm.length === 0 && windows.longTerm.length === 0) {
    return null;
  }
  const sections: string[] = [];
  if (windows.nearTerm.length > 0) {
    sections.push(
      [
        '### Hard preferences (EXPLICIT — honour as guardrails for this week)',
        'The user stated these directly. Treat each as a constraint on the week you generate; do not contradict one without surfacing the conflict.',
        ...windows.nearTerm.map(renderEntry),
      ].join('\n'),
    );
  }
  if (windows.longTerm.length > 0) {
    sections.push(
      [
        '### Soft preferences (INFERRED — long-term bias, never an override)',
        'These are learned tendencies, not orders. Lean toward them when free to choose, but an explicit signal or a health constraint always wins.',
        ...windows.longTerm.map(renderEntry),
      ].join('\n'),
    );
  }
  return sections.join('\n\n');
}
