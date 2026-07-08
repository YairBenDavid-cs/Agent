/**
 * Pure significance gate for the Garmin-sync trigger — no I/O, no framework.
 *
 * A sync must only fire the (expensive, user-facing) FULL_SESSION_DAY replan
 * when the freshly-matched data actually suggests changing the week. Otherwise
 * the sync stays silent — no pipeline, no conversation, no card batch. The gate
 * is deterministic (matcher-derived facts, not an LLM judgment), and every
 * trigger it finds is captured as a human-readable reason so the eventual
 * proposal can tell the user WHY a change is recommended.
 *
 * Significance triggers:
 *  1. Adherence deviation — a matched past/today session came back `deviated`
 *     or `partially_completed`.
 *  2. Missed session — a planned session strictly in the past is still
 *     `planned` (nothing matched it within the ±1 day window).
 *  3. Unmatched extra load — an observed activity in the window is linked to
 *     no planned session (extra work on top of the plan).
 *
 * The recovery readiness verdict is NOT a gate input (it is produced by the
 * Recovery agent inside the pipeline); it is appended to the persisted batch
 * reason after the run (see PipelineQueue.maybeRecordBatch).
 */

export interface SignificancePlannedSession {
  id: string;
  title: string;
  scheduledDate: string; // YYYY-MM-DD (local)
  type: string;
  outcome: {
    status: string;
    matchedActivityId: number | null;
  };
}

export interface SignificanceObservedSession {
  activityId: number;
  date: string; // YYYY-MM-DD (local)
  type: string;
}

export interface SyncSignificanceInput {
  /** Today's local date (YYYY-MM-DD) in the user's timezone. */
  today: string;
  /** The current week's planned sessions (committed baseline, post-reconcile). */
  plannedWeek: SignificancePlannedSession[];
  /** Observed activities inside the week window (post-reconcile). */
  observedSessions: SignificanceObservedSession[];
}

export interface SyncSignificance {
  significant: boolean;
  /** Human-readable trigger descriptions — persisted as the batch reason. */
  reasons: string[];
}

const DEVIATION_STATUSES = new Set(['deviated', 'partially_completed']);

export function evaluateSyncSignificance(
  input: SyncSignificanceInput,
): SyncSignificance {
  const reasons: string[] = [];

  // 1. Adherence deviations on matched sessions up to today.
  for (const p of input.plannedWeek) {
    if (p.scheduledDate > input.today) continue;
    if (!DEVIATION_STATUSES.has(p.outcome.status)) continue;
    const how =
      p.outcome.status === 'partially_completed'
        ? 'was only partially completed'
        : 'deviated from the plan';
    reasons.push(`"${p.title}" (${p.scheduledDate}) ${how}.`);
  }

  // 2. Missed sessions: strictly past, still unmatched and unresolved.
  for (const p of input.plannedWeek) {
    if (p.scheduledDate >= input.today) continue;
    if (p.outcome.status !== 'planned') continue;
    reasons.push(
      `"${p.title}" (${p.scheduledDate}) was missed — no matching activity was recorded.`,
    );
  }

  // 3. Extra load: observed activities no planned session claimed.
  const claimed = new Set<number>();
  for (const p of input.plannedWeek) {
    if (p.outcome.matchedActivityId != null) {
      claimed.add(p.outcome.matchedActivityId);
    }
  }
  for (const o of input.observedSessions) {
    if (o.date > input.today) continue;
    if (claimed.has(o.activityId)) continue;
    reasons.push(
      `Unplanned ${o.type} activity on ${o.date} — extra load on top of the plan.`,
    );
  }

  return { significant: reasons.length > 0, reasons };
}

/** One-line reason string for persistence/display, or null when silent. */
export function composeSyncReason(sig: SyncSignificance): string | null {
  if (!sig.significant) return null;
  return sig.reasons.join(' ');
}
