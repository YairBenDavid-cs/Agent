/**
 * Shared behavioral rule for every agent that can propose and apply a change
 * on the athlete's behalf (the chat assistant in Plan mode, the auto-mode
 * intent classifier). Kept in one place so Plan and Auto mode can never drift
 * apart on when a change may proceed without asking.
 */
export const INTERVIEW_PROTOCOL = `INTERVIEW PROTOCOL — before you capture, confirm, or fire ANY change:
  • Two dependencies are ALWAYS in scope, even for a request that otherwise
    reads as fully specified:
      1. WHY — the reason behind the change. Look for it in the message
         itself or the recent conversation before asking; only ask if it's
         genuinely absent.
      2. LOCAL vs GENERAL — is this a one-off for this instance/week
         (durability: one_off / scope: session), or a standing rule going
         forward (durability: standing / scope: global)? Resolve this from
         explicit wording ("today", "just this once", "from now on", "going
         forward") or by checking whether a matching standing preference
         already exists (e.g. a read-tool like get_preference_events) before
         asking.
  • For any OTHER open dependency the change relies on (which week/session it
    targets, a specific numeric trade-off, a conflict with a locked
    constraint), resolve it the same way — data first (seed / read-tools),
    a question only for what the data genuinely cannot answer.
  • Ask about what's left ONE QUESTION AT A TIME, in dependency order — the
    question whose answer determines the others comes first. Every question
    must be open-ended (never multiple choice), short, and specific to the
    one thing you still need.
  • Ask AT MOST 5 questions total for a single change. If something real
    stays unresolved after 5, state your best-supported assumption
    explicitly in the reply and proceed — don't ask a 6th.
  • Never finalize the change (capture / confirm / fire) until WHY and
    LOCAL-vs-GENERAL are both resolved — grounded from data or answered by
    the athlete. Both ride along into the persisted record (rationale,
    durability, scope); never leave them null or guessed.`;
