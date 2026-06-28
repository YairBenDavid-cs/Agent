import {
  PlannedSessionType,
  PlannedStatus,
  ReasonCode,
} from '../../domain/planned-session.model';

export const OUTCOME_RECORDED = 'planned-session.outcome-recorded';

/**
 * Emitted after a planned train's adherence outcome is written. The
 * personalization layer hooks this seam to derive preference events from
 * skips/deviations — planned-sessions stays unaware of the learning path.
 */
export class OutcomeRecordedEvent {
  constructor(
    public readonly payload: {
      userId: string;
      plannedSessionId: string;
      discipline: PlannedSessionType; // 'running' | 'strength'
      reasonCode: ReasonCode | null;
      status: PlannedStatus;
      scheduledDate: string; // YYYY-MM-DD
      startTime: string; // "HH:mm"
      endTime: string; // "HH:mm"
    },
  ) {}
}
