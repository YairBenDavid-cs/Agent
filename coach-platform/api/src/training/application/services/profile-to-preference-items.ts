import { PreferenceItemDto } from '../../../personalization/application/dto/preference-item.dto';
import { PreferenceTagType } from '../../../personalization/domain/preference-event.model';
import { TrainingProfile } from '../../domain/training-profile.model';

/**
 * Project the onboarding `TrainingProfile` into explicit, standing preference
 * items so the personalization projection can be built by pure replay of the
 * event log (Approach A). Every item is `explicit` → it materialises as a `hard`
 * truth at N=1; setpoints use latest-value-wins, so a later re-onboarding (a
 * fresh batch with a newer eventDate) naturally overrides these.
 *
 * Pure + framework-free so it can be unit-tested in isolation.
 */
export function profileToPreferenceItems(
  profile: TrainingProfile,
  eventDate: string,
): PreferenceItemDto[] {
  const items: PreferenceItemDto[] = [];
  const discipline = profile.discipline;

  const setpoint = (
    type: PreferenceTagType,
    value: string | number,
    rawText: string,
  ): PreferenceItemDto => ({
    eventDate,
    discipline,
    scope: 'global',
    durability: 'standing',
    tag: { type, value, polarity: 'neutral', confidence: 'explicit' },
    rawText,
  });

  const listPref = (
    type: PreferenceTagType,
    value: string,
    rawText: string,
    extra: Partial<PreferenceItemDto> = {},
  ): PreferenceItemDto => ({
    eventDate,
    discipline,
    scope: 'global',
    durability: 'standing',
    tag: { type, value, polarity: 'prefer', confidence: 'explicit' },
    rawText,
    ...extra,
  });

  /* ── cross-cutting / scheduling ───────────────────────────────── */
  items.push(
    setpoint(
      'session_duration',
      profile.sessionDurationMin,
      `${profile.sessionDurationMin} min per session`,
    ),
  );
  items.push(
    setpoint(
      'sessions_per_week',
      profile.availability.length,
      `${profile.availability.length} sessions per week`,
    ),
  );
  items.push(
    setpoint('primary_goal', profile.goal.primaryGoal, `goal: ${profile.goal.primaryGoal}`),
  );

  /* ── running branch ───────────────────────────────────────────── */
  if (profile.run) {
    const run = profile.run;
    items.push(setpoint('weekly_km', run.weeklyKm, `${run.weeklyKm} km per week`));
    if (run.experienceLevel) {
      items.push(
        setpoint('experience_level', run.experienceLevel, `level: ${run.experienceLevel}`),
      );
    }
    for (const rt of run.likedRunTypes) {
      items.push(
        listPref('run_type_pref', rt, `likes ${rt} runs`, {
          target: { plannedSessionId: null, exerciseId: null, runType: rt },
        }),
      );
    }
  }

  /* ── strength branch ──────────────────────────────────────────── */
  if (profile.strength) {
    const s = profile.strength;
    if (s.experienceLevel) {
      items.push(
        setpoint('experience_level', s.experienceLevel, `level: ${s.experienceLevel}`),
      );
    }
    if (s.splitPreference) {
      items.push(
        setpoint('split_preference', s.splitPreference, `split: ${s.splitPreference}`),
      );
    }
    items.push(
      setpoint(
        'exercises_per_session',
        s.exercisesPerSession,
        `${s.exercisesPerSession} exercises per session`,
      ),
    );
    items.push(setpoint('default_sets', s.setsPerExercise, `${s.setsPerExercise} sets`));
    items.push(setpoint('default_reps', s.repsPerExercise, `${s.repsPerExercise} reps`));

    for (const mg of s.targetMuscleGroups) {
      items.push(listPref('muscle_group_pref', mg, `targets ${mg}`));
    }
    for (const eq of s.equipment) {
      items.push(listPref('equipment_added', eq, `has ${eq}`));
    }
    for (const m of s.trainingModalities) {
      items.push(listPref('modality_pref', m, `prefers ${m}`));
    }
    for (const ex of s.preferredExercises) {
      items.push(listPref('exercise_override', ex, `prefers ${ex}`));
    }
  }

  return items;
}
