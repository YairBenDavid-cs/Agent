import { TrainingProfile } from '../../../domain/training-profile.model';
import { profileToPreferenceItems } from '../profile-to-preference-items';

const EVENT_DATE = '2026-06-27';

function baseProfile(overrides: Partial<TrainingProfile> = {}): TrainingProfile {
  return {
    userId: 'user-1',
    discipline: 'strength',
    goal: { primaryGoal: 'build_muscle', note: null, horizon: '2026-09-27' },
    availability: [
      { day: 'mon', startTime: '18:00', endTime: '19:00' },
      { day: 'wed', startTime: '18:00', endTime: '19:00' },
      { day: 'fri', startTime: '18:00', endTime: '19:00' },
    ],
    sessionDurationMin: 60,
    run: null,
    strength: {
      targetMuscleGroups: ['chest', 'back'],
      exercisesPerSession: 6,
      setsPerExercise: 4,
      repsPerExercise: 8,
      equipment: ['barbell', 'dumbbells'],
      preferredExercises: ['bench press'],
      trainingModalities: ['gym'],
      experienceLevel: 'intermediate',
      splitPreference: 'push_pull_legs',
    },
    status: 'active',
    completedAt: null,
    ...overrides,
  };
}

const byType = (items: ReturnType<typeof profileToPreferenceItems>, type: string) =>
  items.filter((i) => i.tag.type === type);

describe('profileToPreferenceItems', () => {
  it('emits every onboarding signal as an explicit standing item', () => {
    const items = profileToPreferenceItems(baseProfile(), EVENT_DATE);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.tag.confidence).toBe('explicit');
      expect(item.durability).toBe('standing');
      expect(item.eventDate).toBe(EVENT_DATE);
      expect(item.discipline).toBe('strength');
    }
  });

  it('maps the strength dials to their setpoint tags', () => {
    const items = profileToPreferenceItems(baseProfile(), EVENT_DATE);
    expect(byType(items, 'session_duration')[0].tag.value).toBe(60);
    expect(byType(items, 'sessions_per_week')[0].tag.value).toBe(3);
    expect(byType(items, 'split_preference')[0].tag.value).toBe('push_pull_legs');
    expect(byType(items, 'exercises_per_session')[0].tag.value).toBe(6);
    expect(byType(items, 'default_sets')[0].tag.value).toBe(4);
    expect(byType(items, 'default_reps')[0].tag.value).toBe(8);
    expect(byType(items, 'primary_goal')[0].tag.value).toBe('build_muscle');
    expect(byType(items, 'muscle_group_pref')).toHaveLength(2);
    expect(byType(items, 'equipment_added')).toHaveLength(2);
    expect(byType(items, 'modality_pref')).toHaveLength(1);
    expect(byType(items, 'exercise_override')).toHaveLength(1);
  });

  it('maps the running branch with run-type targets', () => {
    const items = profileToPreferenceItems(
      baseProfile({
        discipline: 'running',
        strength: null,
        run: {
          weeklyKm: 40,
          likedRunTypes: ['easy', 'long'],
          experienceLevel: 'beginner',
          longestRecentKm: 10,
          targetRace: 'half',
          recent5kTime: '00:25:00',
        },
      }),
      EVENT_DATE,
    );
    expect(byType(items, 'weekly_km')[0].tag.value).toBe(40);
    const runTypes = byType(items, 'run_type_pref');
    expect(runTypes).toHaveLength(2);
    expect(runTypes.map((i) => i.target?.runType).sort()).toEqual(['easy', 'long']);
  });
});
