import { PreferenceTagType } from '../../domain/preference-event.model';
import { TAG_TYPES } from '../preference-event.schema';

// The PreferenceTagType union is the source of truth; the Mongoose enum must
// stay a superset of it. This object is keyed by the union, so adding a member
// to the union without listing it here is a compile error — and the runtime
// assertion below catches it drifting from the schema enum (the bug that let
// onboarding emit `session_duration` and fail Mongoose validation).
const ALL_TAG_TYPES: Record<PreferenceTagType, true> = {
  disliked_time: true,
  disliked_exercise: true,
  volume_too_high: true,
  volume_too_low: true,
  too_hard: true,
  too_easy: true,
  no_motivation: true,
  injury_or_illness: true,
  time_constraint: true,
  weather: true,
  travel: true,
  equipment_removed: true,
  equipment_added: true,
  time_window_blocked: true,
  time_window_preferred: true,
  diversity_request: true,
  volume_bias: true,
  intensity_bias: true,
  modality_pref: true,
  exercise_override: true,
  injury: true,
  session_duration: true,
  sessions_per_week: true,
  weekly_km: true,
  run_type_pref: true,
  split_preference: true,
  exercises_per_session: true,
  default_sets: true,
  default_reps: true,
  muscle_group_pref: true,
  exercise_prescription: true,
  experience_level: true,
  primary_goal: true,
  other: true,
};

describe('preference-event schema enum', () => {
  it('lists every PreferenceTagType union member in the Mongoose enum', () => {
    const missing = Object.keys(ALL_TAG_TYPES).filter(
      (tag) => !TAG_TYPES.includes(tag),
    );
    expect(missing).toEqual([]);
  });
});
