/**
 * Pure phase resolver for the conversational program-build flow.
 *
 * The build is an assistant-led, human-in-the-loop walk: propose week targets →
 * lock them → draft sessions one at a time → schedule each against the calendar.
 * Rather than storing a "current step" pointer (which can drift from reality),
 * the live phase is *derived* from program / week / session state every turn.
 * That makes resume free: a user who closes the tab mid-build reopens at exactly
 * the phase their data implies (decision 12).
 *
 * This module is intentionally framework-free and side-effect-free so it can be
 * unit-tested in isolation; the orchestrator reads the phase and dispatches.
 */

import { ProgramWeek } from '../../program/domain/program.model';
import {
  CalendarSync,
  PlanState,
} from '../../planned-sessions/domain/planned-session.model';
import { PendingCardBatch } from '../approval/domain/pending-card-batch.model';

/**
 * The minimal session shape the resolver reads. Kept structural so BOTH the
 * domain `PlannedSession` and the `PlannedSessionResponse` DTO satisfy it — the
 * orchestrator can pass whichever it has on hand without a mapping step. The
 * orchestrator keeps the full `PlannedSessionResponse[]` separately for the
 * rich operations (quota guardrail, calendar write) that need more fields.
 */
export interface BuildSession {
  planState: PlanState;
  calendarSync: CalendarSync | null;
}

/**
 * The build phases, in forward order. Each maps to one Coach/Planner action the
 * orchestrator performs this turn (see the §1 table in the plan doc).
 */
export type BuildPhase =
  | 'PROPOSE_TARGETS'
  | 'AWAIT_TARGETS_CONSENT'
  | 'DRAFT_SESSION'
  | 'AWAIT_SESSION_CONSENT'
  | 'PROPOSE_SLOTS'
  | 'AWAIT_SLOT_CONSENT'
  | 'COMPLETE';

/**
 * Everything the resolver needs to place the build on its state machine. Kept as
 * a plain snapshot so the orchestrator can assemble it from its repos and the
 * resolver stays pure.
 */
export interface BuildSnapshot {
  /** The week being built (week 1 in the onboarding flow). */
  week: ProgramWeek;
  /** All planned sessions for that week — committed (approved) and tentative (drafted). */
  sessions: BuildSession[];
  /**
   * The open per-session card batch, if one awaits a decision. Only a `pending`
   * batch counts as outstanding; terminal batches are ignored.
   */
  pendingBatch: PendingCardBatch | null;
  /**
   * Whether a calendar-slot proposal is currently awaiting the user's pick.
   * Derived by the orchestrator from the latest assistant message meta (BW3);
   * the resolver takes it as an input so it stays pure.
   */
  slotProposalOutstanding: boolean;
}

/** A session counts toward the week quota once it has been approved (committed). */
function isCommitted(session: BuildSession): boolean {
  return session.planState === 'committed';
}

/** A committed session is "scheduled" once its calendar event has been written. */
function isScheduled(session: BuildSession): boolean {
  return session.calendarSync?.eventId != null;
}

/**
 * Whether a week's build is functionally done: quota met, every committed
 * session scheduled. Mirrors the COMPLETE-phase check in `resolveBuildPhase`,
 * but callable from approval paths that never run the build conversation's
 * own turns (e.g. the Program page's whole-week approval).
 */
export function isWeekBuildComplete(week: ProgramWeek, sessions: BuildSession[]): boolean {
  const sessionCount = week.weeklyTargets?.sessionCount ?? 0;
  if (sessionCount <= 0) return false;
  const committed = sessions.filter(isCommitted);
  if (committed.length < sessionCount) return false;
  const scheduled = committed.filter(isScheduled);
  return scheduled.length === committed.length;
}

/**
 * Resolve the current build phase from live state. Precedence matters: an
 * outstanding consent gate (card batch / slot pick) always wins over the action
 * that would otherwise be taken, so the orchestrator never re-drafts or
 * re-proposes while the user still owes a decision.
 */
export function resolveBuildPhase(snapshot: BuildSnapshot): BuildPhase {
  const { week, sessions, pendingBatch, slotProposalOutstanding } = snapshot;
  const weekState = week.weekState ?? 'open';

  // Terminal: the week has been fully scheduled and locked.
  if (weekState === 'locked') {
    return 'COMPLETE';
  }

  // Targets phase — nothing about the week's quota is frozen yet.
  if (weekState === 'open') {
    const targets = week.weeklyTargets ?? null;
    // No proposal on the table → the coach proposes one.
    if (targets === null) {
      return 'PROPOSE_TARGETS';
    }
    // A tentative proposal exists (lockedAt still null) → await yes / revise.
    return 'AWAIT_TARGETS_CONSENT';
  }

  // weekState === 'targets_locked' — the quota is frozen; build the sessions.
  const sessionCount = week.weeklyTargets?.sessionCount ?? 0;
  const committed = sessions.filter(isCommitted);

  // A pending session card always gates: wait for approve / adjust first.
  if (pendingBatch !== null && pendingBatch.status === 'pending') {
    return 'AWAIT_SESSION_CONSENT';
  }

  // Still missing sessions → draft the next one.
  if (committed.length < sessionCount) {
    return 'DRAFT_SESSION';
  }

  // All sessions are committed; now schedule them one at a time.
  if (slotProposalOutstanding) {
    return 'AWAIT_SLOT_CONSENT';
  }
  const scheduled = committed.filter(isScheduled);
  if (scheduled.length < committed.length) {
    return 'PROPOSE_SLOTS';
  }

  // Every session scheduled but the week isn't flipped to `locked` yet — the
  // orchestrator performs that flip on this COMPLETE turn.
  return 'COMPLETE';
}
