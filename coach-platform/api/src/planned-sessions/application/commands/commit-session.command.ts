import { SessionDiff } from '../../domain/planned-session.model';

/**
 * Per-session commit for the chat-originated edit path: flip ONE train to
 * `committed` and persist its display `lastDiff`. The iterative flow (Step B)
 * finalizes sessions individually, and chat edits commit straight through (no
 * revise/approve buttons), replaying the diff so the user sees what changed.
 *
 * Distinct from `CommitWeekCommand`, which approves a whole week at once.
 */
export class CommitSessionCommand {
  constructor(
    public readonly userId: string,
    public readonly plannedSessionId: string,
    public readonly lastDiff: SessionDiff,
  ) {}
}

export interface CommitSessionResult {
  committed: true;
  plannedSessionId: string;
}
