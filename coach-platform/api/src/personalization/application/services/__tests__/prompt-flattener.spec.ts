import { ExercisePrescription, PrefEntry, TimeWindow } from '../../../domain/pref-entry.model';
import { UserPreferences } from '../../../domain/user-preferences.model';
import { flattenProjectionToPrompt } from '../prompt-flattener';

/** Minimal PrefEntry factory — only `value` varies per assertion. */
function entry<T>(value: T, overrides: Partial<PrefEntry<T>> = {}): PrefEntry<T> {
  return {
    value,
    strength: 'hard',
    confidence: 'explicit',
    supportCount: 1,
    sourceEventIds: ['e1'],
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastReinforced: '2026-01-01T00:00:00.000Z',
    confirmed: true,
    ...overrides,
  };
}

/**
 * A projection with EVERY field populated, so the test can assert the flattener
 * drops nothing. This is the regression guard for the decision-critical
 * setpoints the Coach reads (weeklyKm, sessionsPerWeek, defaultSets/Reps, etc.).
 */
function fullyPopulatedProjection(): UserPreferences {
  const window: TimeWindow = { day: 'mon', start: '06:00', end: '07:00' };
  const prescription: ExercisePrescription = {
    exerciseId: 'BARBELL_SQUAT',
    sets: 5,
    reps: 5,
    weightKg: 100,
  };
  return {
    id: 'p1',
    userId: 'u1',
    discipline: 'strength',
    avoidedExercises: [entry('BURPEE')],
    preferredExercises: [entry('DEADLIFT')],
    blockedTimeWindows: [entry(window)],
    preferredTimeWindows: [entry(window)],
    removedEquipment: [entry('BARBELL')],
    addedEquipment: [entry('KETTLEBELL')],
    preferredModalities: [entry('crossfit')],
    volumeBias: entry(0.3),
    intensityBias: entry(-0.2),
    diversityBias: entry(0.1),
    sessionDurationMin: entry(45),
    sessionsPerWeek: entry(4),
    weeklyKm: entry(40),
    preferredRunTypes: [entry('tempo')],
    avoidedRunTypes: [entry('sprint')],
    splitPreference: entry('upper_lower'),
    exercisesPerSession: entry(6),
    defaultSets: entry(3),
    defaultReps: entry(10),
    targetMuscleGroups: [entry('quads')],
    exercisePrescriptions: [entry(prescription)],
    experienceLevel: entry('intermediate'),
    primaryGoal: entry('strength_gain'),
    sourceEventCount: 12,
    taxonomyVersion: 1,
    rebuiltAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('flattenProjectionToPrompt', () => {
  it('returns a placeholder when the projection is null', () => {
    expect(flattenProjectionToPrompt(null)).toContain('No learned preferences');
  });

  it('renders every decision-critical setpoint (no silent drops)', () => {
    const out = flattenProjectionToPrompt(fullyPopulatedProjection());

    // Setpoint dials the Coach depends on for load/volume/structure decisions.
    const requiredFragments = [
      'Session duration (min): 45',
      'Sessions per week: 4',
      'Weekly km: 40',
      'Split: upper_lower',
      'Exercises per session: 6',
      'Default sets: 3',
      'Default reps: 10',
      'Experience level: intermediate',
      'Primary goal: strength_gain',
      // List setpoints.
      'Preferred run types',
      'tempo',
      'Avoid run types',
      'sprint',
      'Target muscle groups',
      'quads',
      // Per-exercise prescription.
      'BARBELL_SQUAT',
      '5 sets × 5 reps × 100kg',
      // Biases.
      'Volume bias: +0.30',
      'Intensity bias: -0.20',
      'Diversity bias: +0.10',
    ];

    for (const fragment of requiredFragments) {
      expect(out).toContain(fragment);
    }
  });

  it('omits empty sections but keeps populated ones', () => {
    const projection = fullyPopulatedProjection();
    projection.avoidedExercises = [];
    const out = flattenProjectionToPrompt(projection);
    expect(out).not.toContain('Avoid exercises:');
    expect(out).toContain('Prefer exercises:');
  });
});
