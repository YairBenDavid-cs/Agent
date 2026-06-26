import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PLANNED_SESSION_REPOSITORY,
  PlannedSessionRepositoryPort,
} from '../../planned-sessions/domain/planned-session.repository.port';
import {
  SESSIONS_REPOSITORY,
  SessionsRepositoryPort,
} from '../../sessions/domain/sessions.repository.port';
import {
  deriveStatus,
  MATCH_WINDOW_DAYS,
  selectCandidate,
} from '../domain/match-policy';

/** Upper bound on sessions reconciled per run — generous for a weekly window. */
const SCAN_LIMIT = 500;

export interface MatchSummary {
  userId: string;
  sessionsScanned: number;
  matched: number;
}

/**
 * Reconciles observed sessions (Garmin or self-report) against planned trains:
 * for each session in a window it finds the nearest still-`planned`, same-type
 * train within ±1 day, links it (`matched_activity_id`), and sets the adherence
 * status. Unmatched sessions are left alone — they surface as "extra" work, not
 * corruptions of the plan. Idempotent: already-resolved trains are skipped.
 */
@Injectable()
export class SessionMatcherService {
  private readonly logger = new Logger(SessionMatcherService.name);

  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessions: SessionsRepositoryPort,
    @Inject(PLANNED_SESSION_REPOSITORY)
    private readonly planned: PlannedSessionRepositoryPort,
  ) {}

  async reconcile(
    userId: string,
    from: string,
    to: string,
  ): Promise<MatchSummary> {
    const observed = await this.sessions.findRange(
      userId,
      from,
      to,
      null,
      null,
      SCAN_LIMIT,
    );

    const summary: MatchSummary = {
      userId,
      sessionsScanned: observed.length,
      matched: 0,
    };

    // Prevent two sessions in one run from claiming the same planned train.
    const claimed = new Set<string>();

    for (const session of observed) {
      const window = dayWindow(session.date, MATCH_WINDOW_DAYS);
      const candidates = (
        await this.planned.findMatchCandidates(
          userId,
          session.type,
          window.from,
          window.to,
        )
      ).filter((c) => c.id != null && !claimed.has(c.id));

      const match = selectCandidate(session, candidates);
      if (!match || match.id == null) {
        continue;
      }

      const status = deriveStatus(match, session);
      await this.planned.updateOutcome(userId, match.id, {
        ...match.outcome,
        status,
        matchedActivityId: session.activityId,
        recordedAt: new Date().toISOString(),
      });
      claimed.add(match.id);
      summary.matched += 1;
    }

    this.logger.log(
      `Matched ${summary.matched}/${summary.sessionsScanned} sessions for ${userId} [${from}..${to}]`,
    );
    return summary;
  }
}

/** Closed [from, to] window of ±days around an anchor YYYY-MM-DD date. */
const dayWindow = (
  date: string,
  days: number,
): { from: string; to: string } => {
  const anchor = Date.parse(`${date}T00:00:00Z`);
  const shift = (n: number): string =>
    new Date(anchor + n * 86_400_000).toISOString().slice(0, 10);
  return { from: shift(-days), to: shift(days) };
};
