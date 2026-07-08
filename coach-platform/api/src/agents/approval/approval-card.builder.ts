/**
 * Pure assembly of the per-session approval cards shown when a generated week is
 * presented (NotebookLM-slide model). Each card carries the session's
 * prescription summary + the Coach's `coachNotes` rationale + the Planner's
 * placement note + a diff vs the currently-committed week, so the user sees WHY
 * each session changed before approving the whole batch.
 *
 * Diff is computed by `slotKey` (the deterministic identity of a session within
 * a program week): a draft slot absent from the baseline is `new`; a baseline
 * slot absent from the draft is `removed`; a slot in both is `modified` (with the
 * changed fields listed) or `unchanged`. On the first generation of a week the
 * baseline is empty, so every card is `new`.
 *
 * Framework-free and side-effect-free — fully unit-testable.
 */

import {
  RunningPlan,
  StrengthPlan,
} from '../../planned-sessions/domain/planned-session.model';

export type CardDiffStatus = 'new' | 'modified' | 'unchanged' | 'removed';

/** The minimal session shape the card builder needs (DTO- and domain-compatible). */
export interface CardSessionLike {
  id: string;
  slotKey: string;
  type: string;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  intensityLabel: string;
  estDurationMin: number;
  coachNotes: string | null;
  /** Structured prescription body (exactly one populated, gated by `type`). */
  running: RunningPlan | null;
  strength: StrengthPlan | null;
}

/** Fields whose change between baseline and draft is user-visible on a card. */
const DIFFED_FIELDS = [
  'title',
  'scheduledDate',
  'startTime',
  'endTime',
  'intensityLabel',
  'estDurationMin',
] as const satisfies readonly (keyof CardSessionLike)[];

export interface ApprovalCard {
  /** The draft session id, or the baseline id for a `removed` card. */
  sessionId: string;
  slotKey: string;
  type: string;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  intensityLabel: string;
  estDurationMin: number;
  coachNotes: string | null;
  /** Structured prescription body, rendered in the chat card and program page. */
  running: RunningPlan | null;
  strength: StrengthPlan | null;
  /** The Planner's "why this slot" note, when supplied for this slot. */
  placementNote: string | null;
  diffStatus: CardDiffStatus;
  /** Names of the fields that differ from the baseline (empty unless modified). */
  changedFields: string[];
}

export interface BuildCardsInput {
  /** The tentative draft sessions awaiting approval. */
  draft: CardSessionLike[];
  /** The currently-committed sessions for the same week (empty on first gen). */
  baseline?: CardSessionLike[];
  /** Optional Planner placement notes, keyed by slotKey. */
  placementNotes?: Record<string, string>;
}

function changedFieldsBetween(
  baseline: CardSessionLike,
  draft: CardSessionLike,
): string[] {
  return DIFFED_FIELDS.filter((f) => baseline[f] !== draft[f]);
}

/**
 * Build the ordered per-session card set for an approval batch. Cards follow the
 * draft's scheduled order; any `removed` baseline slots are appended last so the
 * user still sees what dropped out.
 */
export function buildApprovalCards(input: BuildCardsInput): ApprovalCard[] {
  const baseline = input.baseline ?? [];
  const notes = input.placementNotes ?? {};
  const baselineBySlot = new Map(baseline.map((s) => [s.slotKey, s]));
  const draftSlots = new Set(input.draft.map((s) => s.slotKey));

  const cards: ApprovalCard[] = input.draft.map((d) => {
    const prior = baselineBySlot.get(d.slotKey);
    let diffStatus: CardDiffStatus;
    let changedFields: string[] = [];
    if (!prior) {
      diffStatus = 'new';
    } else {
      changedFields = changedFieldsBetween(prior, d);
      diffStatus = changedFields.length > 0 ? 'modified' : 'unchanged';
    }
    return {
      sessionId: d.id,
      slotKey: d.slotKey,
      type: d.type,
      title: d.title,
      scheduledDate: d.scheduledDate,
      startTime: d.startTime,
      endTime: d.endTime,
      intensityLabel: d.intensityLabel,
      estDurationMin: d.estDurationMin,
      coachNotes: d.coachNotes,
      running: d.running,
      strength: d.strength,
      placementNote: notes[d.slotKey] ?? null,
      diffStatus,
      changedFields,
    };
  });

  for (const b of baseline) {
    if (!draftSlots.has(b.slotKey)) {
      cards.push({
        sessionId: b.id,
        slotKey: b.slotKey,
        type: b.type,
        title: b.title,
        scheduledDate: b.scheduledDate,
        startTime: b.startTime,
        endTime: b.endTime,
        intensityLabel: b.intensityLabel,
        estDurationMin: b.estDurationMin,
        coachNotes: b.coachNotes,
        running: b.running,
        strength: b.strength,
        placementNote: null,
        diffStatus: 'removed',
        changedFields: [],
      });
    }
  }

  return cards;
}
