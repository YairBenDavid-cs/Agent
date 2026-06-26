import { Types } from 'mongoose';
import {
  CalendarSync,
  PlannedExercise,
  PlannedOutcome,
  PlannedSession,
  RunningPlan,
  RunSegment,
  StrengthPlan,
} from '../domain/planned-session.model';
import {
  CalendarSyncClass,
  PlannedExerciseClass,
  PlannedOutcomeClass,
  PlannedSessionDoc,
  RunningPlanClass,
  RunSegmentClass,
  StrengthPlanClass,
} from './planned-session.schema';

/** Lean doc as returned by Mongo reads — carries the generated `_id`. */
export type PlannedSessionLean = PlannedSessionDoc & { _id: Types.ObjectId };

/* ── running ───────────────────────────────────────────────────── */

const segToPersistence = (s: RunSegment): RunSegmentClass => ({
  kind: s.kind,
  repeat: s.repeat,
  distance_m: s.distanceM,
  duration_sec: s.durationSec,
  target_pace: s.targetPace,
  target_hr_zone: s.targetHrZone,
  rest_sec: s.restSec,
});

const segToDomain = (s: RunSegmentClass): RunSegment => ({
  kind: s.kind,
  repeat: s.repeat ?? 1,
  distanceM: s.distance_m ?? null,
  durationSec: s.duration_sec ?? null,
  targetPace: s.target_pace ?? null,
  targetHrZone: s.target_hr_zone ?? null,
  restSec: s.rest_sec ?? null,
});

const runToPersistence = (r: RunningPlan): RunningPlanClass => ({
  run_type: r.runType,
  total_distance_km: r.totalDistanceKm,
  total_duration_min: r.totalDurationMin,
  target_pace: r.targetPace,
  target_hr_zone: r.targetHrZone,
  target_rpe: r.targetRpe,
  segments: r.segments.map(segToPersistence),
});

const runToDomain = (r: RunningPlanClass): RunningPlan => ({
  runType: r.run_type,
  totalDistanceKm: r.total_distance_km ?? null,
  totalDurationMin: r.total_duration_min ?? null,
  targetPace: r.target_pace ?? null,
  targetHrZone: r.target_hr_zone ?? null,
  targetRpe: r.target_rpe ?? null,
  segments: (r.segments ?? []).map(segToDomain),
});

/* ── strength ──────────────────────────────────────────────────── */

const exToPersistence = (e: PlannedExercise): PlannedExerciseClass => ({
  name: e.name,
  category: e.category,
  order: e.order,
  sets: e.sets,
  target_reps_min: e.targetRepsMin,
  target_reps_max: e.targetRepsMax,
  target_weight_kg: e.targetWeightKg,
  target_pct_1rm: e.targetPct1rm,
  target_rir: e.targetRir,
  rest_sec: e.restSec,
  tempo: e.tempo,
  superset_group: e.supersetGroup,
});

const exToDomain = (e: PlannedExerciseClass): PlannedExercise => ({
  name: e.name,
  category: e.category,
  order: e.order,
  sets: e.sets,
  targetRepsMin: e.target_reps_min,
  targetRepsMax: e.target_reps_max,
  targetWeightKg: e.target_weight_kg ?? null,
  targetPct1rm: e.target_pct_1rm ?? null,
  targetRir: e.target_rir ?? null,
  restSec: e.rest_sec ?? null,
  tempo: e.tempo ?? null,
  supersetGroup: e.superset_group ?? null,
});

const strengthToPersistence = (s: StrengthPlan): StrengthPlanClass => ({
  split_focus: s.splitFocus,
  exercises: s.exercises.map(exToPersistence),
  target_volume_load: s.targetVolumeLoad,
});

const strengthToDomain = (s: StrengthPlanClass): StrengthPlan => ({
  splitFocus: s.split_focus ?? null,
  exercises: (s.exercises ?? []).map(exToDomain),
  targetVolumeLoad: s.target_volume_load ?? null,
});

/* ── outcome + calendar ────────────────────────────────────────── */

export const outcomeToPersistence = (
  o: PlannedOutcome,
): PlannedOutcomeClass => ({
  status: o.status,
  reason_code: o.reasonCode,
  perceived_effort: o.perceivedEffort,
  enjoyment: o.enjoyment,
  matched_activity_id: o.matchedActivityId,
  feedback_ref: o.feedbackRef,
  recorded_at: o.recordedAt,
});

const outcomeToDomain = (o: PlannedOutcomeClass): PlannedOutcome => ({
  status: o.status,
  reasonCode: o.reason_code ?? null,
  perceivedEffort: o.perceived_effort ?? null,
  enjoyment: o.enjoyment ?? null,
  matchedActivityId: o.matched_activity_id ?? null,
  feedbackRef: o.feedback_ref ?? null,
  recordedAt: o.recorded_at ?? null,
});

const calendarToPersistence = (c: CalendarSync): CalendarSyncClass => ({
  provider: c.provider,
  event_id: c.eventId,
  synced_at: c.syncedAt,
  sync_state: c.syncState,
});

const calendarToDomain = (c: CalendarSyncClass): CalendarSync => ({
  provider: c.provider,
  eventId: c.event_id ?? null,
  syncedAt: c.synced_at ?? null,
  syncState: c.sync_state,
});

/* ── root ──────────────────────────────────────────────────────── */

export const toPersistence = (s: PlannedSession): PlannedSessionDoc => ({
  user_id: s.userId,
  program_id: s.programId,
  week_index: s.weekIndex,
  slot_key: s.slotKey,
  type: s.type,
  scheduled_date: s.scheduledDate,
  start_time: s.startTime,
  end_time: s.endTime,
  timezone: s.timezone,
  scheduled_start_utc: s.scheduledStartUtc,
  plan_state: s.planState,
  title: s.title,
  est_duration_min: s.estDurationMin,
  intensity_label: s.intensityLabel,
  coach_notes: s.coachNotes,
  running: s.running ? runToPersistence(s.running) : null,
  strength: s.strength ? strengthToPersistence(s.strength) : null,
  outcome: outcomeToPersistence(s.outcome),
  calendar_sync: s.calendarSync ? calendarToPersistence(s.calendarSync) : null,
});

export const toDomain = (doc: PlannedSessionLean): PlannedSession => ({
  id: doc._id?.toString() ?? null,
  userId: doc.user_id,
  programId: doc.program_id,
  weekIndex: doc.week_index,
  slotKey: doc.slot_key,
  type: doc.type,
  scheduledDate: doc.scheduled_date,
  startTime: doc.start_time,
  endTime: doc.end_time,
  timezone: doc.timezone,
  scheduledStartUtc: doc.scheduled_start_utc,
  planState: doc.plan_state,
  title: doc.title,
  estDurationMin: doc.est_duration_min,
  intensityLabel: doc.intensity_label,
  coachNotes: doc.coach_notes ?? null,
  running: doc.running ? runToDomain(doc.running) : null,
  strength: doc.strength ? strengthToDomain(doc.strength) : null,
  outcome: doc.outcome
    ? outcomeToDomain(doc.outcome)
    : {
        status: 'planned',
        reasonCode: null,
        perceivedEffort: null,
        enjoyment: null,
        matchedActivityId: null,
        feedbackRef: null,
        recordedAt: null,
      },
  calendarSync: doc.calendar_sync ? calendarToDomain(doc.calendar_sync) : null,
});
