import {
  RunningDetail,
  StrengthDetail,
  WorkoutSession,
} from '../domain/workout-session.model';
import {
  RunningDetailDto,
  StrengthDetailDto,
} from './dto/session.dto';
import { SessionResponse } from './dto/session.response';

export const runningFromDto = (dto: RunningDetailDto): RunningDetail => ({
  name: dto.name ?? null,
  distance_km: dto.distance_km ?? null,
  duration_min: dto.duration_min ?? null,
  avg_pace: dto.avg_pace ?? null,
  avg_hr: dto.avg_hr ?? null,
  max_hr: dto.max_hr ?? null,
  aerobic_te: dto.aerobic_te ?? null,
  anaerobic_te: dto.anaerobic_te ?? null,
  te_label: dto.te_label ?? null,
  training_load: dto.training_load ?? null,
  calories: dto.calories ?? null,
  elevation_gain_m: dto.elevation_gain_m ?? null,
  avg_cadence: dto.avg_cadence ?? null,
  avg_stride_length_cm: dto.avg_stride_length_cm ?? null,
  avg_ground_contact_ms: dto.avg_ground_contact_ms ?? null,
  splits: (dto.splits ?? []).map((s) => ({
    distance_m: s.distance_m ?? null,
    pace: s.pace ?? null,
    avg_hr: s.avg_hr ?? null,
  })),
});

export const strengthFromDto = (dto: StrengthDetailDto): StrengthDetail => ({
  name: dto.name ?? null,
  duration_min: dto.duration_min ?? null,
  avg_hr: dto.avg_hr ?? null,
  max_hr: dto.max_hr ?? null,
  calories: dto.calories ?? null,
  aerobic_te: dto.aerobic_te ?? null,
  anaerobic_te: dto.anaerobic_te ?? null,
  te_label: dto.te_label ?? null,
  training_load: dto.training_load ?? null,
  total_sets: dto.total_sets ?? null,
  total_reps: dto.total_reps ?? null,
  session_volume_load: dto.session_volume_load ?? null,
  exercises: (dto.exercises ?? []).map((e) => ({
    category: e.category,
    sets: e.sets ?? 0,
    reps: e.reps ?? 0,
    top_weight_kg: e.top_weight_kg ?? 0,
    volume_load: e.volume_load ?? 0,
    est_1rm_kg: e.est_1rm_kg ?? 0,
  })),
});

export const toSessionResponse = (s: WorkoutSession): SessionResponse => ({
  activityId: s.activityId,
  date: s.date,
  type: s.type,
  subtype: s.subtype,
  source: s.source,
  running: s.running,
  strength: s.strength,
});
