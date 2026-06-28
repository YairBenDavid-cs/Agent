import { Logger } from '@nestjs/common';
import { CURRENT_TAXONOMY_VERSION } from '../../../domain/preference-event.model';
import { PrefEntry, TimeWindow } from '../../../domain/pref-entry.model';
import { UserPreferences } from '../../../domain/user-preferences.model';
import { ProjectionValidatorService } from '../projection-validator.service';
import { makeEntry } from './preference-event.factory';

const REBUILT_AT = '2026-06-30T00:00:00.000Z';

function makePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    id: null,
    userId: 'user-1',
    discipline: 'strength',
    avoidedExercises: [],
    preferredExercises: [],
    blockedTimeWindows: [],
    preferredTimeWindows: [],
    removedEquipment: [],
    addedEquipment: [],
    preferredModalities: [],
    volumeBias: null,
    intensityBias: null,
    diversityBias: null,
    sessionDurationMin: null,
    sessionsPerWeek: null,
    weeklyKm: null,
    preferredRunTypes: [],
    avoidedRunTypes: [],
    splitPreference: null,
    exercisesPerSession: null,
    defaultSets: null,
    defaultReps: null,
    targetMuscleGroups: [],
    exercisePrescriptions: [],
    experienceLevel: null,
    primaryGoal: null,
    sourceEventCount: 0,
    taxonomyVersion: CURRENT_TAXONOMY_VERSION,
    rebuiltAt: REBUILT_AT,
    ...overrides,
  };
}

describe('ProjectionValidatorService', () => {
  let svc: ProjectionValidatorService;
  beforeEach(() => {
    // The gate logs a warning for every (intentional) breach in these fixtures;
    // silence it so the suite output stays clean.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    svc = new ProjectionValidatorService();
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes a clean projection with no violations', () => {
    const prefs = makePrefs({
      avoidedExercises: [makeEntry('burpees-id', { lastReinforced: REBUILT_AT })],
    });
    expect(svc.validate(prefs)).toHaveLength(0);
    expect(svc.enforce(prefs).avoidedExercises).toHaveLength(1);
  });

  it('demotes an unconfirmed inferred entry from hard to soft', () => {
    const prefs = makePrefs({
      avoidedExercises: [
        makeEntry('x-id', {
          strength: 'hard',
          confidence: 'inferred',
          confirmed: false,
          lastReinforced: REBUILT_AT,
        }),
      ],
    });
    const violations = svc.validate(prefs);
    expect(violations.map((v) => v.kind)).toContain('inferred_hard');
    expect(svc.enforce(prefs).avoidedExercises[0].strength).toBe('soft');
  });

  it('leaves a CONFIRMED inferred-hard entry untouched', () => {
    const prefs = makePrefs({
      avoidedExercises: [
        makeEntry('x-id', {
          strength: 'hard',
          confidence: 'inferred',
          confirmed: true,
          lastReinforced: REBUILT_AT,
        }),
      ],
    });
    expect(svc.validate(prefs)).toHaveLength(0);
    expect(svc.enforce(prefs).avoidedExercises[0].strength).toBe('hard');
  });

  it('drops a soft/inferred entry past the decay horizon', () => {
    const prefs = makePrefs({
      avoidedExercises: [
        makeEntry('stale-id', { lastReinforced: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    const violations = svc.validate(prefs);
    expect(violations.map((v) => v.kind)).toContain('decayed_not_pruned');
    expect(svc.enforce(prefs).avoidedExercises).toHaveLength(0);
  });

  it('never decays a hard+explicit entry, however old', () => {
    const prefs = makePrefs({
      blockedTimeWindows: [
        makeEntry<TimeWindow>(
          { day: 'mon', start: '06:00', end: '09:00' },
          {
            strength: 'hard',
            confidence: 'explicit',
            lastReinforced: '2024-01-01T00:00:00.000Z',
          },
        ),
      ],
    });
    expect(svc.validate(prefs)).toHaveLength(0);
    expect(svc.enforce(prefs).blockedTimeWindows).toHaveLength(1);
  });

  it('clamps a bias outside [-maxBias, maxBias]', () => {
    const prefs = makePrefs({
      volumeBias: makeEntry(0.9, {
        strength: 'hard',
        confidence: 'explicit',
        lastReinforced: REBUILT_AT,
      }),
    });
    const violations = svc.validate(prefs);
    expect(violations.map((v) => v.kind)).toContain('bias_out_of_range');
    expect(svc.enforce(prefs).volumeBias!.value).toBeCloseTo(0.5);
  });

  it('drops an entry with no provenance', () => {
    const prefs = makePrefs({
      preferredModalities: [
        makeEntry('crossfit', { sourceEventIds: [], lastReinforced: REBUILT_AT }),
      ],
    });
    const violations = svc.validate(prefs);
    expect(violations.map((v) => v.kind)).toContain('missing_provenance');
    expect(svc.enforce(prefs).preferredModalities).toHaveLength(0);
  });

  it('repairs a supportCount that disagrees with provenance length', () => {
    const prefs = makePrefs({
      avoidedExercises: [
        makeEntry('x-id', {
          supportCount: 5,
          sourceEventIds: ['a', 'b'],
          lastReinforced: REBUILT_AT,
        }),
      ],
    });
    const violations = svc.validate(prefs);
    expect(violations.map((v) => v.kind)).toContain('support_count_mismatch');
    expect(svc.enforce(prefs).avoidedExercises[0].supportCount).toBe(2);
  });

  it('dedupes repeated values within a slice', () => {
    const prefs = makePrefs({
      removedEquipment: [
        makeEntry('barbell', { sourceEventIds: ['a'], lastReinforced: REBUILT_AT }),
        makeEntry('barbell', { sourceEventIds: ['b'], lastReinforced: REBUILT_AT }),
      ],
    });
    const violations = svc.validate(prefs);
    expect(violations.map((v) => v.kind)).toContain('duplicate_entry');
    expect(svc.enforce(prefs).removedEquipment).toHaveLength(1);
  });

  it('dedupes time windows by day|start|end', () => {
    const w: TimeWindow = { day: 'mon', start: '06:00', end: '09:00' };
    const prefs = makePrefs({
      blockedTimeWindows: [
        makeEntry<TimeWindow>(w, { sourceEventIds: ['a'], lastReinforced: REBUILT_AT }),
        makeEntry<TimeWindow>({ ...w }, { sourceEventIds: ['b'], lastReinforced: REBUILT_AT }),
      ],
    });
    expect(svc.enforce(prefs).blockedTimeWindows).toHaveLength(1);
  });

  it('passes a clean explicit setpoint and never decays it, however old', () => {
    const prefs = makePrefs({
      weeklyKm: makeEntry(40, {
        strength: 'hard',
        confidence: 'explicit',
        lastReinforced: '2024-01-01T00:00:00.000Z',
      }),
    });
    expect(svc.validate(prefs)).toHaveLength(0);
    expect(svc.enforce(prefs).weeklyKm!.value).toBe(40);
  });

  it('demotes an unconfirmed inferred-hard setpoint to soft', () => {
    const prefs = makePrefs({
      defaultSets: makeEntry(5, {
        strength: 'hard',
        confidence: 'inferred',
        confirmed: false,
        lastReinforced: REBUILT_AT,
      }),
    });
    expect(svc.validate(prefs).map((v) => v.kind)).toContain('inferred_hard');
    expect(svc.enforce(prefs).defaultSets!.strength).toBe('soft');
  });

  it('dedupes per-exercise prescriptions by exerciseId', () => {
    const presc = (sets: number, ids: string[]) =>
      makeEntry(
        { exerciseId: 'bench-id', sets, reps: 8, weightKg: 60 },
        { sourceEventIds: ids, lastReinforced: REBUILT_AT },
      );
    const prefs = makePrefs({
      exercisePrescriptions: [presc(4, ['a']), presc(3, ['b'])],
    });
    expect(svc.enforce(prefs).exercisePrescriptions).toHaveLength(1);
  });

  it('does not mutate the input projection (returns a repaired copy)', () => {
    const entry = makeEntry('x-id', {
      strength: 'hard',
      confidence: 'inferred',
      confirmed: false,
      lastReinforced: REBUILT_AT,
    });
    const prefs = makePrefs({ avoidedExercises: [entry] });
    svc.enforce(prefs);
    expect(prefs.avoidedExercises[0].strength).toBe('hard'); // original untouched
  });
});
