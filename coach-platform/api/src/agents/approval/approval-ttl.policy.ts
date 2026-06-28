/**
 * Pure TTL policy for unaddressed approval drafts. A tentative week is presented
 * as a card the user may never explicitly action; the policy decides what
 * happens when it lapses, and the kind of trigger that produced it decides the
 * safe default:
 *
 *  - SESSION-DAY plans (the always-on `fetch` pipeline): a plan MUST exist by the
 *    time the session starts, so an unaddressed draft AUTO-COMMITS at session
 *    start (it is already guardrail-validated + Recovery-gated). Marked
 *    "auto-applied — tap to adjust".
 *  - USER-INITIATED drafts (mid-chat / revision): the status quo is the safe
 *    default, so an unaddressed draft EXPIRES after an inactivity window and the
 *    current committed plan is kept; the `preference_event` already persisted the
 *    intent for the next scheduled generation.
 *  - Superseded drafts are invalidated immediately elsewhere (the queue), so are
 *    not the concern of this time-based policy.
 *
 * Side-effect-free; all "now"/deadline inputs are passed in for testability.
 */

export type DraftKind = 'session_day' | 'user_initiated';

export type TtlDecision = 'auto_commit' | 'expire' | 'keep';

export interface DraftTtlState {
  kind: DraftKind;
  /** ISO instant the draft was created / last presented. */
  createdAtUtc: string;
  /**
   * For a session-day draft: the ISO instant the session starts (the commit
   * deadline). Ignored for user-initiated drafts.
   */
  sessionStartUtc?: string | null;
}

/** Inactivity window after which a user-initiated draft is discarded (48h). */
export const USER_DRAFT_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Decide what to do with an unaddressed draft as of `nowUtc`.
 *  - session_day: `auto_commit` once now ≥ sessionStart, else `keep` (still live).
 *  - user_initiated: `expire` once now ≥ createdAt + TTL, else `keep`.
 */
export function classifyDraftTtl(
  state: DraftTtlState,
  nowUtc: string,
): TtlDecision {
  const now = Date.parse(nowUtc);

  if (state.kind === 'session_day') {
    const start = state.sessionStartUtc
      ? Date.parse(state.sessionStartUtc)
      : NaN;
    if (Number.isNaN(start)) {
      // No deadline known → never force-commit on a clock; leave it live.
      return 'keep';
    }
    return now >= start ? 'auto_commit' : 'keep';
  }

  const created = Date.parse(state.createdAtUtc);
  if (Number.isNaN(created)) {
    return 'keep';
  }
  return now - created >= USER_DRAFT_TTL_MS ? 'expire' : 'keep';
}
