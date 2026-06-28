import {
  PlannedStatus,
  ReasonCode,
} from '../../planned-sessions/domain/planned-session.model';

/**
 * What an outcome should trigger. The plan's rule (no silent difficulty-proxy
 * gate): ANY negative or missed outcome asks the user a clarifying question and
 * is then handled like a revision; clean/positive completions never interrupt;
 * injury/illness fires the safety pipeline immediately, no debounce.
 */
export type OutcomeAction = 'immediate_safety' | 'ask_clarifying' | 'none';

/** Reason codes that, on their own, warrant a clarifying question. */
const CLARIFY_REASONS = new Set<ReasonCode>([
  'too_hard',
  'too_easy',
  'volume_too_high',
  'volume_too_low',
  'no_motivation',
  'disliked_exercise',
  'disliked_time',
]);

/** Statuses that represent a negative/missed outcome. */
const NEGATIVE_STATUSES = new Set<PlannedStatus>([
  'skipped', // includes matcher-detected misses
  'deviated',
  'partially_completed',
]);

/**
 * Classify a recorded outcome. Safety dominates: an injury/illness reason fires
 * immediately regardless of status. Otherwise a negative status OR a negative
 * reason asks the user what happened (batched to end-of-day by the caller).
 */
export function classifyOutcome(
  status: PlannedStatus,
  reasonCode: ReasonCode | null,
): OutcomeAction {
  if (reasonCode === 'injury_or_illness') {
    return 'immediate_safety';
  }
  if (NEGATIVE_STATUSES.has(status) || (reasonCode && CLARIFY_REASONS.has(reasonCode))) {
    return 'ask_clarifying';
  }
  return 'none';
}
