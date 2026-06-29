import { EventDiscipline } from '../../personalization/domain/preference-event.model';

/**
 * The action-point flush. Invoked when the user locks something (a session,
 * weekly targets — wired in later phases): distil the conversation staging
 * buffer to net intent, persist it as one `source='chat'` batch, and clear the
 * buffer. Distinct from the session-teardown `FlushSessionPreferencesCommand`
 * (`source='session_flush'`); this fires at an explicit approval, not idle
 * teardown.
 */
export class FlushConversationPreferencesCommand {
  constructor(
    public readonly userId: string,
    public readonly conversationId: string,
    /** Correlates the distillation pass with the triggering action point. */
    public readonly runId: string,
    public readonly discipline: EventDiscipline,
    /** Today's local date (YYYY-MM-DD) for stamping the emitted events. */
    public readonly today: string,
  ) {}
}
