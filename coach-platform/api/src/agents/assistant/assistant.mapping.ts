import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { TagConfidence } from '../../personalization/domain/preference-event.model';
import { PendingCandidate } from '../conversation/domain/conversation.model';
import { CapturedSignal } from './assistant.contracts';

/** Normalize a captured signal's optional target into the persisted shape. */
function normalizeTarget(s: CapturedSignal) {
  return s.target &&
    (s.target.plannedSessionId || s.target.exerciseId || s.target.runType)
    ? {
        plannedSessionId: s.target.plannedSessionId ?? null,
        exerciseId: s.target.exerciseId ?? null,
        runType: s.target.runType ?? null,
      }
    : null;
}

/**
 * Map a captured signal to the source-agnostic preference item the ingestion
 * service writes. Centralised here so every producer (the per-turn decision seam
 * and the action-point distillation pass) stamps an identical item shape; only
 * the `confidence` (hard/soft) and `eventDate` differ by caller.
 */
export function signalToPreferenceItem(
  s: CapturedSignal,
  today: string,
  confidence: TagConfidence,
): PreferenceItemDto {
  const target = normalizeTarget(s);

  return {
    eventDate: today,
    discipline: s.discipline,
    scope: s.scope,
    durability: s.durability,
    expiresAt: null,
    target,
    tag: {
      type: s.tagType,
      value: s.value,
      polarity: s.polarity,
      confidence,
    },
    rawText: s.rawText,
  };
}

/**
 * The lane→confidence axis: an explicit order (`black`) is a HARD structural
 * constraint; an inferred/ambiguous signal (`gray`) is a SOFT bias. White never
 * captures, so it has no mapping here.
 */
export function confidenceForLane(lane: 'black' | 'gray'): TagConfidence {
  return lane === 'black' ? 'explicit' : 'inferred';
}

/**
 * Map a captured signal to a neutral `PendingCandidate` for the conversation
 * staging buffer (Plan-mode iteration). Unlike `signalToPreferenceItem` — which
 * produces a ready-to-write event — this preserves the raw signal plus its lane
 * (hard/soft) and capture time, so the action-point flush can distil NET intent
 * across the whole iteration (decision E) before any durable write.
 */
export function signalToPendingCandidate(
  s: CapturedSignal,
  lane: 'black' | 'gray',
  capturedAt: string,
): PendingCandidate {
  return {
    lane,
    tagType: s.tagType,
    value: s.value,
    polarity: s.polarity,
    durability: s.durability,
    scope: s.scope,
    discipline: s.discipline,
    affectsCurrentWeek: s.affectsCurrentWeek,
    target: normalizeTarget(s),
    rawText: s.rawText,
    capturedAt,
  };
}
