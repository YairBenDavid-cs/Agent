import { ExerciseResolverService } from '../../../../exercises/application/exercise-resolver.service';
import { DistillationService } from '../distillation.service';
import { PromotionService } from '../promotion.service';
import { makeEvent } from './preference-event.factory';

const NOW = new Date('2026-06-30T00:00:00.000Z');

/** Stub resolver: any non-empty name resolves to `<name>-id`; ids end with -id. */
const resolver = {
  resolveId: (raw: string) => (raw ? `${raw}-id` : null),
  isValidId: (id: string) => typeof id === 'string' && id.endsWith('-id'),
} as unknown as ExerciseResolverService;

describe('DistillationService.distill', () => {
  let svc: DistillationService;
  beforeEach(() => {
    svc = new DistillationService(new PromotionService(), resolver);
  });

  it('promotes a thrice-reinforced inferred dislike to a soft avoided exercise', () => {
    const events = ['2026-06-01', '2026-06-08', '2026-06-15'].map((d) =>
      makeEvent({
        eventDate: d,
        tag: { type: 'disliked_exercise', value: 'burpees' },
      }),
    );
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.avoidedExercises).toHaveLength(1);
    expect(prefs.avoidedExercises[0].value).toBe('burpees-id');
    expect(prefs.avoidedExercises[0].strength).toBe('soft');
    expect(prefs.sourceEventCount).toBe(3);
  });

  it('keeps an inferred dislike below threshold out of the projection', () => {
    const events = ['2026-06-01', '2026-06-08'].map((d) =>
      makeEvent({
        eventDate: d,
        tag: { type: 'disliked_exercise', value: 'burpees' },
      }),
    );
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.avoidedExercises).toHaveLength(0);
  });

  it('folds a cross-cutting (discipline=null) explicit window into the discipline', () => {
    const events = [
      makeEvent({
        discipline: null,
        scope: 'global',
        tag: {
          type: 'time_window_blocked',
          value: 'mon 06:00-09:00',
          polarity: 'avoid',
          confidence: 'explicit',
        },
      }),
    ];
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.blockedTimeWindows).toHaveLength(1);
    expect(prefs.blockedTimeWindows[0].strength).toBe('hard');
    expect(prefs.blockedTimeWindows[0].value).toEqual({
      day: 'mon',
      start: '06:00',
      end: '09:00',
    });
  });

  it('ignores one_off and other-discipline events', () => {
    const events = [
      makeEvent({
        durability: 'one_off',
        tag: { type: 'disliked_exercise', value: 'burpees', confidence: 'explicit' },
      }),
      makeEvent({
        discipline: 'running',
        tag: { type: 'disliked_exercise', value: 'lunges', confidence: 'explicit' },
      }),
    ];
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.avoidedExercises).toHaveLength(0);
  });

  it('builds a hard volume bias from an explicit numeric signal', () => {
    const events = [
      makeEvent({
        scope: 'global',
        tag: {
          type: 'volume_bias',
          value: -0.2,
          polarity: 'decrease',
          confidence: 'explicit',
        },
      }),
    ];
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.volumeBias).not.toBeNull();
    expect(prefs.volumeBias!.value).toBeCloseTo(-0.2);
    expect(prefs.volumeBias!.strength).toBe('hard');
  });

  it('clamps an accumulated bias to maxBias', () => {
    const events = [0.4, 0.4, 0.4].map(() =>
      makeEvent({
        scope: 'global',
        tag: {
          type: 'volume_bias',
          value: 0.4,
          polarity: 'increase',
          confidence: 'explicit',
        },
      }),
    );
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.volumeBias!.value).toBeCloseTo(0.5); // 1.2 clamped to maxBias
  });

  it('cancels conflicting biases to no net bias', () => {
    const events = [
      makeEvent({
        scope: 'global',
        tag: { type: 'volume_bias', value: 0.3, polarity: 'increase', confidence: 'explicit' },
      }),
      makeEvent({
        scope: 'global',
        tag: { type: 'volume_bias', value: -0.3, polarity: 'decrease', confidence: 'explicit' },
      }),
    ];
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.volumeBias).toBeNull();
  });

  it('maps outcome-style too_hard signals onto the intensity bias slice', () => {
    const events = ['2026-06-01', '2026-06-08', '2026-06-15'].map((d) =>
      makeEvent({
        eventDate: d,
        scope: 'global',
        tag: { type: 'too_hard', value: null, polarity: 'decrease', confidence: 'inferred' },
      }),
    );
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.intensityBias).not.toBeNull();
    expect(prefs.intensityBias!.value).toBeLessThan(0);
    expect(prefs.intensityBias!.strength).toBe('soft');
  });

  it('builds a hard weekly-km setpoint from an explicit signal (N=1)', () => {
    const events = [
      makeEvent({
        discipline: 'running',
        scope: 'global',
        tag: { type: 'weekly_km', value: 40, polarity: 'neutral', confidence: 'explicit' },
      }),
    ];
    const prefs = svc.distill(events, 'running', NOW);
    expect(prefs.weeklyKm).not.toBeNull();
    expect(prefs.weeklyKm!.value).toBe(40);
    expect(prefs.weeklyKm!.strength).toBe('hard');
  });

  it('takes the latest explicit value for a setpoint (does not accumulate)', () => {
    const events = [
      makeEvent({
        discipline: 'running',
        eventDate: '2026-01-01',
        scope: 'global',
        tag: { type: 'weekly_km', value: 30, polarity: 'neutral', confidence: 'explicit' },
      }),
      makeEvent({
        discipline: 'running',
        eventDate: '2026-06-01',
        scope: 'global',
        tag: { type: 'weekly_km', value: 50, polarity: 'neutral', confidence: 'explicit' },
      }),
    ];
    const prefs = svc.distill(events, 'running', NOW);
    expect(prefs.weeklyKm!.value).toBe(50); // newest wins, not 30 nor a sum
    expect(prefs.weeklyKm!.supportCount).toBe(1); // only the winning value backs it
  });

  it('splits run_type_pref into preferred/avoided lists by polarity', () => {
    const events = [
      makeEvent({
        discipline: 'running',
        tag: { type: 'run_type_pref', value: 'long', polarity: 'prefer', confidence: 'explicit' },
        target: { plannedSessionId: null, exerciseId: null, runType: 'long' },
      }),
      makeEvent({
        discipline: 'running',
        tag: { type: 'run_type_pref', value: 'intervals', polarity: 'avoid', confidence: 'explicit' },
        target: { plannedSessionId: null, exerciseId: null, runType: 'intervals' },
      }),
    ];
    const prefs = svc.distill(events, 'running', NOW);
    expect(prefs.preferredRunTypes.map((e) => e.value)).toEqual(['long']);
    expect(prefs.avoidedRunTypes.map((e) => e.value)).toEqual(['intervals']);
  });

  it('keeps one latest-wins prescription per exercise', () => {
    const events = [
      makeEvent({
        eventDate: '2026-01-01',
        scope: 'exercise',
        tag: {
          type: 'exercise_prescription',
          value: 'bench-id|sets=3|reps=10|kg=50',
          polarity: 'neutral',
          confidence: 'explicit',
        },
        target: { plannedSessionId: null, exerciseId: 'bench-id', runType: null },
      }),
      makeEvent({
        eventDate: '2026-06-01',
        scope: 'exercise',
        tag: {
          type: 'exercise_prescription',
          value: 'bench-id|sets=4|reps=8|kg=60',
          polarity: 'neutral',
          confidence: 'explicit',
        },
        target: { plannedSessionId: null, exerciseId: 'bench-id', runType: null },
      }),
    ];
    const prefs = svc.distill(events, 'strength', NOW);
    expect(prefs.exercisePrescriptions).toHaveLength(1);
    expect(prefs.exercisePrescriptions[0].value).toEqual({
      exerciseId: 'bench-id',
      sets: 4,
      reps: 8,
      weightKg: 60,
    });
  });

  it('returns an empty-but-valid projection for an empty log', () => {
    const prefs = svc.distill([], 'running', NOW);
    expect(prefs.discipline).toBe('running');
    expect(prefs.avoidedExercises).toEqual([]);
    expect(prefs.volumeBias).toBeNull();
    expect(prefs.sourceEventCount).toBe(0);
    expect(prefs.rebuiltAt).toBe(NOW.toISOString());
  });
});
