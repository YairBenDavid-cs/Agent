/** A single training session. Typed by `type`; only the matching detail is set. */

export type SessionType = 'running' | 'strength';

export interface RunningSplit {
  distance_m: number | null;
  pace: string | null; // "mm:ss /km"
  avg_hr: number | null;
}

export interface RunningDetail {
  name: string | null;
  distance_km: number | null;
  duration_min: number | null;
  avg_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  aerobic_te: number | null;
  anaerobic_te: number | null;
  te_label: string | null;
  training_load: number | null;
  calories: number | null;
  elevation_gain_m: number | null;
  avg_cadence: number | null;
  avg_stride_length_cm: number | null;
  avg_ground_contact_ms: number | null;
  splits: RunningSplit[];
}

export interface ExerciseAggregate {
  category: string;
  sets: number;
  reps: number;
  top_weight_kg: number;
  volume_load: number;
  est_1rm_kg: number;
}

export interface StrengthDetail {
  name: string | null;
  duration_min: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  aerobic_te: number | null;
  anaerobic_te: number | null;
  te_label: string | null;
  training_load: number | null;
  total_sets: number | null;
  total_reps: number | null;
  session_volume_load: number | null;
  exercises: ExerciseAggregate[];
}

export interface WorkoutSession {
  userId: string;
  activityId: number;
  date: string; // YYYY-MM-DD (local)
  type: SessionType;
  subtype: string | null; // Garmin typeKey, e.g. "trail_running"
  source: string;
  contentHash: string;
  running: RunningDetail | null;
  strength: StrengthDetail | null;
}
