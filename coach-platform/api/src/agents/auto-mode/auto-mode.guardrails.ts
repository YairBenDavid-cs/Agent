/**
 * Deterministic swing-bound guardrails for autonomous writes — the last gate
 * before ANY auto-mode commit. Unlike the Coach's own guardrail-bounce (which
 * retries the model within its loop), a violation here aborts the WHOLE run
 * back to Plan mode: an unattended process must never silently push a change
 * this large. Pure functions — the graph supplies live numbers, never I/O.
 */

import { LoadProxyInput, sessionVolume } from '../coach/coach.guardrails';

/** weekly_targets_edit: max relative change to the locked volume budget. */
export const MAX_TARGET_VOLUME_SWING = 0.25; // ±25%
/** weekly_targets_edit: max session-count delta in one revision. */
export const MAX_TARGET_SESSION_COUNT_DELTA = 2;
/** new_week: max week-over-week volume increase (mirrors the Coach's own cap). */
export const MAX_WEEK_OVER_WEEK_VOLUME_INCREASE = 0.15;

export interface TargetsSwingInput {
  previous: { sessionCount: number; totalVolume: number };
  proposed: { sessionCount: number; totalVolume: number };
}

/** Bounds a direct weekly-targets revision. Empty result = safe to commit. */
export function checkTargetsSwing(input: TargetsSwingInput): string[] {
  const violations: string[] = [];
  const { previous, proposed } = input;

  const sessionDelta = Math.abs(proposed.sessionCount - previous.sessionCount);
  if (sessionDelta > MAX_TARGET_SESSION_COUNT_DELTA) {
    violations.push(
      `Session-count change of ${sessionDelta} exceeds the autonomous cap of ` +
        `${MAX_TARGET_SESSION_COUNT_DELTA} (from ${previous.sessionCount} to ` +
        `${proposed.sessionCount}).`,
    );
  }

  if (previous.totalVolume > 0) {
    const swing =
      Math.abs(proposed.totalVolume - previous.totalVolume) / previous.totalVolume;
    if (swing > MAX_TARGET_VOLUME_SWING) {
      violations.push(
        `Volume change of ${(swing * 100).toFixed(0)}% exceeds the autonomous ` +
          `cap of ${MAX_TARGET_VOLUME_SWING * 100}% (from ${previous.totalVolume} ` +
          `to ${proposed.totalVolume}).`,
      );
    }
  }

  return violations;
}

/** Bounds a freshly-generated week's volume against the prior week's actual volume. */
export function checkWeekOverWeekVolume(
  priorWeekVolume: number,
  proposedVolume: number,
  isDeload: boolean,
): string[] {
  if (isDeload || priorWeekVolume <= 0) {
    return [];
  }
  const ceiling = priorWeekVolume * (1 + MAX_WEEK_OVER_WEEK_VOLUME_INCREASE);
  if (proposedVolume > ceiling) {
    return [
      `Proposed weekly volume ${proposedVolume.toFixed(1)} exceeds the ` +
        `autonomous +${MAX_WEEK_OVER_WEEK_VOLUME_INCREASE * 100}% cap over the ` +
        `prior week's ${priorWeekVolume.toFixed(1)} (ceiling ${ceiling.toFixed(1)}).`,
    ];
  }
  return [];
}

/** Sum of native-unit volume across a set of sessions — shared by both checks above. */
export function totalNativeVolume(sessions: LoadProxyInput[]): number {
  return sessions.reduce((sum, s) => sum + sessionVolume(s), 0);
}

/** Readiness severity order, for "is round 2 worse than round 1" comparisons. */
const READINESS_SEVERITY: Record<'green' | 'amber' | 'red', number> = {
  green: 0,
  amber: 1,
  red: 2,
};

/** True when `candidate` is a strictly worse (more cautious) band than `baseline`. */
export function isWorseReadiness(
  candidate: 'green' | 'amber' | 'red',
  baseline: 'green' | 'amber' | 'red',
): boolean {
  return READINESS_SEVERITY[candidate] > READINESS_SEVERITY[baseline];
}

/**
 * Safety-biased tie-break for a bounded 2-round debate: scale a proposed
 * targets change halfway back toward the previous (locked) value. Used when
 * round 2 disagrees with round 1 — rather than aborting on mere disagreement,
 * the retry adopts the more conservative midpoint.
 */
export function conservativeTargets(
  previous: { sessionCount: number; totalVolume: number },
  proposed: { sessionCount: number; totalVolume: number; keyGoals: string[] },
): { sessionCount: number; totalVolume: number; keyGoals: string[] } {
  return {
    sessionCount: Math.round((previous.sessionCount + proposed.sessionCount) / 2),
    totalVolume: Math.round(((previous.totalVolume + proposed.totalVolume) / 2) * 10) / 10,
    keyGoals: proposed.keyGoals,
  };
}
