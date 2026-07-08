import { CalendarEventInput } from '../../integrations/domain/google-calendar';
import {
  PlannedExercise,
  RunBlock,
  RunStep,
  RunningPlan,
  StrengthPlan,
} from '../../planned-sessions/domain/planned-session.model';

/** The session fields needed to project a planned train onto a calendar event. */
export interface CalendarSyncSessionLike {
  id: string;
  title: string;
  running: RunningPlan | null;
  strength: StrengthPlan | null;
  scheduledStartUtc: string;
  estDurationMin: number;
  timezone: string;
}

/* ── session-body formatting (the event description) ───────────── */

function formatQty(distanceM: number | null, durationSec: number | null): string {
  if (distanceM != null) {
    return distanceM >= 1000 ? `${distanceM / 1000} km` : `${distanceM} m`;
  }
  if (durationSec != null) {
    return durationSec % 60 === 0 ? `${durationSec / 60} min` : `${durationSec}s`;
  }
  return '';
}

function formatRunStep(step: RunStep): string {
  const qty = formatQty(step.distanceM, step.durationSec);
  let text: string;
  if (step.type === 'rest') {
    text = qty ? `rest ${qty}` : 'rest';
  } else {
    const parts = [qty || 'run'];
    if (step.targetPace) parts.push(`@ ${step.targetPace}`);
    else if (step.targetHrZone != null) parts.push(`@ Z${step.targetHrZone}`);
    text = parts.join(' ');
  }
  return step.note ? `${text} (${step.note})` : text;
}

function formatRunBlock(block: RunBlock): string {
  const name =
    block.label ?? block.kind.charAt(0).toUpperCase() + block.kind.slice(1);
  const steps = block.steps.map(formatRunStep).join(' + ');
  return block.repeat > 1
    ? `${name}: ${block.repeat}× (${steps})`
    : `${name}: ${steps}`;
}

function formatRunning(plan: RunningPlan): string {
  const totals: string[] = [];
  if (plan.totalDistanceKm != null) totals.push(`${plan.totalDistanceKm} km`);
  if (plan.totalDurationMin != null) totals.push(`${plan.totalDurationMin} min`);
  if (plan.targetPace) totals.push(`target ${plan.targetPace}`);
  else if (plan.targetHrZone != null) totals.push(`Z${plan.targetHrZone}`);
  const lines = totals.length ? [totals.join(' · ')] : [];
  lines.push(...plan.blocks.map(formatRunBlock));
  return lines.join('\n');
}

function formatExercise(ex: PlannedExercise): string {
  const reps =
    ex.targetRepsMin === ex.targetRepsMax
      ? `${ex.targetRepsMin}`
      : `${ex.targetRepsMin}–${ex.targetRepsMax}`;
  let line = `${ex.order}. ${ex.name} — ${ex.sets}×${reps}`;
  if (ex.targetWeightKg != null) line += ` @ ${ex.targetWeightKg} kg`;
  else if (ex.targetPct1rm != null) line += ` @ ${ex.targetPct1rm}% 1RM`;
  else if (ex.targetRir != null) line += ` @ RIR ${ex.targetRir}`;
  if (ex.restSec != null) line += `, rest ${ex.restSec}s`;
  if (ex.tempo) line += `, tempo ${ex.tempo}`;
  if (ex.supersetGroup) line += ` [superset ${ex.supersetGroup}]`;
  return line;
}

function formatStrength(plan: StrengthPlan): string {
  const lines: string[] = [];
  if (plan.splitFocus) lines.push(`Focus: ${plan.splitFocus}`);
  lines.push(
    ...plan.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(formatExercise),
  );
  return lines.join('\n');
}

/**
 * Renders the structured session body (run blocks / strength exercises) as the
 * plain-text calendar description. Coach rationale (coachNotes) intentionally
 * stays out of the calendar. Undefined when the session has no body.
 */
export function formatSessionBody(
  session: Pick<CalendarSyncSessionLike, 'running' | 'strength'>,
): string | undefined {
  if (session.running) return formatRunning(session.running) || undefined;
  if (session.strength) return formatStrength(session.strength) || undefined;
  return undefined;
}

/**
 * Pure projection of a committed planned session onto a Google Calendar event
 * input. The end instant is derived from the start instant + estDurationMin (the
 * Coach owns duration), so a single source field drives both ends. Tagged with
 * the planned session id so the owned-event guard can recognise it later.
 */
export function toCalendarEventInput(
  session: CalendarSyncSessionLike,
): CalendarEventInput {
  const startMs = Date.parse(session.scheduledStartUtc);
  const endMs = startMs + session.estDurationMin * 60 * 1000;
  return {
    summary: session.title,
    description: formatSessionBody(session),
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    timezone: session.timezone,
    plannedSessionId: session.id,
  };
}
