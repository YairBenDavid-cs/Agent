/**
 * Tunables for the distillation / promotion-decay engine. Centralised so the
 * "anomaly vs evidence" thresholds and decay horizon are auditable in one place
 * (Phase 7 may move these behind ConfigService; the values live here for now).
 *
 * Rules encoded:
 *   - explicit + standing  -> hard immediately (support threshold 1).
 *   - inferred dislike      -> needs `inferredDislikeSupport` reinforcements
 *                              before it materialises as a soft preference.
 *   - inferred like         -> needs `inferredLikeSupport` (we trust positive
 *                              signals a little sooner).
 *   - inference ALONE never becomes hard — soft is its ceiling.
 *   - soft/inferred entries decay after `decayDays` without reinforcement;
 *     hard/explicit entries never decay.
 */
export const PERSONALIZATION_CONFIG = {
  /** Reinforcements required to promote an inferred dislike to a soft pref. */
  inferredDislikeSupport: 3,
  /** Reinforcements required to promote an inferred like to a soft pref. */
  inferredLikeSupport: 2,
  /** Days without reinforcement before a soft/inferred entry decays away. */
  decayDays: 90,
  /** Default per-event nudge for a volume bias when no explicit number given. */
  volumeStep: 0.1,
  /** Default per-event nudge for an intensity bias. */
  intensityStep: 0.1,
  /** Default per-event nudge for a diversity bias. */
  diversityStep: 0.25,
  /** Clamp for any accumulated bias magnitude. */
  maxBias: 0.5,
  /** How many recent standing events to surface in the generation context. */
  recentStandingLimit: 10,
} as const;
