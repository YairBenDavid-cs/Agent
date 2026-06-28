import { Injectable } from '@nestjs/common';
import { PERSONALIZATION_CONFIG } from '../../domain/personalization.config';
import { PrefEntry } from '../../domain/pref-entry.model';
import { PreferenceEvent } from '../../domain/preference-event.model';

/** Days between two YYYY-MM-DD / ISO dates. */
const daysBetween = (fromIso: string, to: Date): number => {
  const from = new Date(fromIso).getTime();
  return (to.getTime() - from) / (1000 * 60 * 60 * 24);
};

const toIso = (yyyyMmDd: string): string => new Date(yyyyMmDd).toISOString();

/**
 * Turns a group of reinforcing events (all about the SAME preference) into a
 * single `PrefEntry`, applying the promotion/decay rules:
 *
 *   - explicit + standing            -> hard (materialises immediately).
 *   - inferred, below threshold      -> null (an anomaly, not yet evidence).
 *   - inferred, at/above threshold   -> soft (inference never reaches hard).
 *   - inferred that decayed          -> null (stale, no recent reinforcement).
 *
 * `now` is the rebuild instant, so a full replay is deterministic.
 */
@Injectable()
export class PromotionService {
  /**
   * @param inferredThreshold reinforcements required if the signal is inferred
   *        (dislike vs like differ — caller picks the constant).
   */
  buildEntry<T>(
    value: T,
    events: PreferenceEvent[],
    inferredThreshold: number,
    now: Date,
  ): PrefEntry<T> | null {
    if (events.length === 0) {
      return null;
    }

    const ids = events
      .map((e) => e.id)
      .filter((id): id is string => id !== null);
    const dates = events.map((e) => e.eventDate).sort();
    const firstSeen = toIso(dates[0]);
    const lastReinforcedRaw = dates[dates.length - 1];
    const lastReinforced = toIso(lastReinforcedRaw);

    const hasExplicit = events.some((e) => e.tag.confidence === 'explicit');
    const hasInferred = events.some((e) => e.tag.confidence === 'inferred');
    const supportCount = events.length;

    if (!hasExplicit) {
      // Inference alone. Needs enough evidence AND recent reinforcement.
      if (supportCount < inferredThreshold) {
        return null;
      }
      if (daysBetween(lastReinforcedRaw, now) > PERSONALIZATION_CONFIG.decayDays) {
        return null;
      }
    }

    return {
      value,
      // Explicit standing statements are hard; inference tops out at soft.
      strength: hasExplicit ? 'hard' : 'soft',
      confidence: hasExplicit ? 'explicit' : 'inferred',
      supportCount,
      sourceEventIds: ids,
      firstSeen,
      lastReinforced,
      // "confirmed" = an inferred guess that the user later stated explicitly.
      confirmed: hasExplicit && hasInferred,
    };
  }
}
