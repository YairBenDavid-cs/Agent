import { SessionContent } from '../../domain/planned-session.repository.port';
import { SessionDiff } from '../../domain/planned-session.model';

/**
 * Content-edit sibling of `UpsertSessionScheduleCommand`: overwrite a single
 * train's prescription (title/duration/intensity/notes/running-or-strength),
 * independent of its `planState`. This is the chat-originated edit path (Flow
 * A) — the diff is authored upstream (agent tier) and persisted for display,
 * matching `CommitSessionCommand`'s pattern.
 *
 * Deliberately does NOT touch `weeklyTargets`/`weekState` — a non-breaching
 * edit needs zero cascade. Whether this edit breaches the week's locked
 * targets is decided by the caller (via `coach.guardrails.ts`) before this
 * command is issued.
 */
export class UpsertSessionContentCommand {
  constructor(
    public readonly userId: string,
    public readonly plannedSessionId: string,
    public readonly content: SessionContent,
    public readonly lastDiff: SessionDiff,
  ) {}
}

export interface UpsertSessionContentResult {
  updated: true;
  plannedSessionId: string;
}
