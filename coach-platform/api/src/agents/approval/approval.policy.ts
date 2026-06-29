/**
 * Pure approval-action rules. The card flow is commit-only: a generated week is
 * approved or (when a committed fallback exists) rejected. Targeted changes are
 * made by conversing in Plan mode, not via a card-revise round-trip.
 *
 *  - approve → flip tentative → committed + sync calendar.
 *  - reject  → discard the tentative draft, keep the current committed week.
 *
 * Reject is ONLY allowed when a committed week already exists: on the FIRST
 * generation of a week there is nothing to fall back to, so the user may only
 * approve. This guard is enforced here (code), not left to the UI.
 */

export type ApprovalAction = 'approve' | 'reject';

export interface ApprovalContext {
  /** True when a committed version of this week already exists (a fallback). */
  hasCommittedFallback: boolean;
}

/** The set of actions the user may take on the current card batch. */
export function allowedApprovalActions(ctx: ApprovalContext): ApprovalAction[] {
  const actions: ApprovalAction[] = ['approve'];
  if (ctx.hasCommittedFallback) {
    actions.push('reject');
  }
  return actions;
}

export function isActionAllowed(
  action: ApprovalAction,
  ctx: ApprovalContext,
): boolean {
  return allowedApprovalActions(ctx).includes(action);
}

/**
 * Validate a requested action against the context. Returns null when allowed, or
 * a human-readable reason when the action must be refused (so the caller can
 * bounce it without persisting anything).
 */
export function rejectionReason(
  action: ApprovalAction,
  ctx: ApprovalContext,
): string | null {
  if (isActionAllowed(action, ctx)) {
    return null;
  }
  if (action === 'reject') {
    return 'Cannot reject the first generation of a week — there is no committed plan to fall back to. Approve or revise instead.';
  }
  return `Action "${action}" is not allowed in the current state.`;
}
