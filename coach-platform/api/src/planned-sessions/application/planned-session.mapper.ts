import { PlannedSession } from '../domain/planned-session.model';
import { PlannedSessionResponse } from './dto/planned-session.response';

export const toPlannedSessionResponse = (
  s: PlannedSession,
): PlannedSessionResponse => ({
  id: s.id ?? '',
  programId: s.programId,
  weekIndex: s.weekIndex,
  slotKey: s.slotKey,
  type: s.type,
  scheduledDate: s.scheduledDate,
  startTime: s.startTime,
  endTime: s.endTime,
  timezone: s.timezone,
  scheduledStartUtc: s.scheduledStartUtc,
  planState: s.planState,
  title: s.title,
  estDurationMin: s.estDurationMin,
  intensityLabel: s.intensityLabel,
  coachNotes: s.coachNotes,
  running: s.running,
  strength: s.strength,
  outcome: s.outcome,
  calendarSync: s.calendarSync,
});
