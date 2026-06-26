import {
  CalendarSync,
  PlannedOutcome,
  PlannedSessionType,
  PlanState,
  RunningPlan,
  StrengthPlan,
} from '../../domain/planned-session.model';

/** Outward shape of a planned train. No internal persistence fields (user_id). */
export class PlannedSessionResponse {
  id!: string;
  programId!: string;
  weekIndex!: number;
  type!: PlannedSessionType;
  scheduledDate!: string;
  startTime!: string;
  endTime!: string;
  timezone!: string;
  scheduledStartUtc!: string;
  planState!: PlanState;
  title!: string;
  estDurationMin!: number;
  intensityLabel!: string;
  coachNotes!: string | null;
  running!: RunningPlan | null;
  strength!: StrengthPlan | null;
  outcome!: PlannedOutcome;
  calendarSync!: CalendarSync | null;
}
