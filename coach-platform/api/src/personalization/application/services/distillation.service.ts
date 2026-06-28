import { Injectable } from '@nestjs/common';
import { ExerciseResolverService } from '../../../exercises/application/exercise-resolver.service';
import { PERSONALIZATION_CONFIG } from '../../domain/personalization.config';
import {
  ExercisePrescription,
  PrefEntry,
  TimeWindow,
} from '../../domain/pref-entry.model';
import {
  CURRENT_TAXONOMY_VERSION,
  EventDiscipline,
  PreferenceEvent,
} from '../../domain/preference-event.model';
import { UserPreferences } from '../../domain/user-preferences.model';
import { PromotionService } from './promotion.service';

/** List-valued slices keyed by a normalized value. */
type ListSlice =
  | 'avoidedExercises'
  | 'preferredExercises'
  | 'blockedTimeWindows'
  | 'preferredTimeWindows'
  | 'removedEquipment'
  | 'addedEquipment'
  | 'preferredModalities'
  | 'preferredRunTypes'
  | 'avoidedRunTypes'
  | 'targetMuscleGroups';

/** Single-valued signed-scalar slices. */
type BiasSlice = 'volumeBias' | 'intensityBias' | 'diversityBias';

/**
 * Single-valued setpoint slices: the latest explicit value wins (these do NOT
 * accumulate like biases, nor key like lists). `string`-valued slices carry an
 * enum; the rest are numeric dials.
 */
type SetpointSlice =
  | 'sessionDurationMin'
  | 'sessionsPerWeek'
  | 'weeklyKm'
  | 'splitPreference'
  | 'exercisesPerSession'
  | 'defaultSets'
  | 'defaultReps'
  | 'experienceLevel'
  | 'primaryGoal';

interface ListCandidate {
  slice: ListSlice;
  key: string;
  value: string | TimeWindow;
}

const { inferredDislikeSupport, inferredLikeSupport, maxBias } =
  PERSONALIZATION_CONFIG;

/** Slices whose inferred promotion uses the (more cautious) dislike threshold. */
const DISLIKE_SLICES: ReadonlySet<ListSlice> = new Set<ListSlice>([
  'avoidedExercises',
  'blockedTimeWindows',
  'removedEquipment',
  'avoidedRunTypes',
]);

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/**
 * Replays the (already filtered) standing event log into a `user_preferences`
 * projection for one discipline. Pure transformation: same events + same `now`
 * always yield the same projection, so the store is fully rebuildable.
 *
 * Tagging happened at write time, so this never re-parses prose — it only reads
 * the structured `tag`/`target` off each event.
 */
@Injectable()
export class DistillationService {
  constructor(
    private readonly promotion: PromotionService,
    private readonly exercises: ExerciseResolverService,
  ) {}

  /**
   * @param allEvents the whole log (oldest-first). Events for `discipline` plus
   *        cross-cutting (discipline === null) events are folded in.
   */
  distill(
    allEvents: PreferenceEvent[],
    discipline: EventDiscipline,
    now: Date,
  ): UserPreferences {
    const relevant = allEvents.filter(
      (e) =>
        e.durability === 'standing' &&
        (e.discipline === discipline || e.discipline === null),
    );

    // Group list-slice events by (slice, key); collect bias-/setpoint-slice events.
    const lists = new Map<
      ListSlice,
      Map<string, { value: string | TimeWindow; events: PreferenceEvent[] }>
    >();
    const biases = new Map<BiasSlice, PreferenceEvent[]>();
    const setpoints = new Map<SetpointSlice, PreferenceEvent[]>();
    const prescriptionEvents: PreferenceEvent[] = [];

    for (const event of relevant) {
      const biasSlice = this.biasSliceFor(event);
      if (biasSlice) {
        const bucket = biases.get(biasSlice) ?? [];
        bucket.push(event);
        biases.set(biasSlice, bucket);
        continue;
      }
      const setpointSlice = this.setpointSliceFor(event);
      if (setpointSlice) {
        const bucket = setpoints.get(setpointSlice) ?? [];
        bucket.push(event);
        setpoints.set(setpointSlice, bucket);
        continue;
      }
      if (event.tag.type === 'exercise_prescription') {
        prescriptionEvents.push(event);
        continue;
      }
      const candidate = this.listCandidateFor(event);
      if (!candidate) {
        continue;
      }
      const bySlice = lists.get(candidate.slice) ?? new Map();
      const group = bySlice.get(candidate.key) ?? {
        value: candidate.value,
        events: [],
      };
      group.events.push(event);
      bySlice.set(candidate.key, group);
      lists.set(candidate.slice, bySlice);
    }

    const buildList = <T extends string | TimeWindow>(
      slice: ListSlice,
    ): PrefEntry<T>[] => {
      const threshold = DISLIKE_SLICES.has(slice)
        ? inferredDislikeSupport
        : inferredLikeSupport;
      const bySlice = lists.get(slice);
      if (!bySlice) {
        return [];
      }
      const entries: PrefEntry<T>[] = [];
      for (const { value, events } of bySlice.values()) {
        const entry = this.promotion.buildEntry<T>(
          value as T,
          events,
          threshold,
          now,
        );
        if (entry) {
          entries.push(entry);
        }
      }
      // Strongest evidence first — handy for prompt truncation downstream.
      return entries.sort((a, b) => b.supportCount - a.supportCount);
    };

    const buildSetpoint = (slice: SetpointSlice): PrefEntry<number> | null =>
      this.buildSetpointEntry<number>(
        setpoints.get(slice) ?? [],
        (e) => (typeof e.tag.value === 'number' ? e.tag.value : null),
        (v) => String(v),
        now,
      );

    const buildStringSetpoint = (
      slice: SetpointSlice,
    ): PrefEntry<string> | null =>
      this.buildSetpointEntry<string>(
        setpoints.get(slice) ?? [],
        (e) => (typeof e.tag.value === 'string' && e.tag.value ? e.tag.value : null),
        (v) => v,
        now,
      );

    return {
      id: null,
      userId: relevant[0]?.userId ?? allEvents[0]?.userId ?? '',
      discipline,
      avoidedExercises: buildList<string>('avoidedExercises'),
      preferredExercises: buildList<string>('preferredExercises'),
      blockedTimeWindows: buildList<TimeWindow>('blockedTimeWindows'),
      preferredTimeWindows: buildList<TimeWindow>('preferredTimeWindows'),
      removedEquipment: buildList<string>('removedEquipment'),
      addedEquipment: buildList<string>('addedEquipment'),
      preferredModalities: buildList<string>('preferredModalities'),
      volumeBias: this.buildBias(
        biases.get('volumeBias') ?? [],
        PERSONALIZATION_CONFIG.volumeStep,
        now,
      ),
      intensityBias: this.buildBias(
        biases.get('intensityBias') ?? [],
        PERSONALIZATION_CONFIG.intensityStep,
        now,
      ),
      diversityBias: this.buildBias(
        biases.get('diversityBias') ?? [],
        PERSONALIZATION_CONFIG.diversityStep,
        now,
      ),
      sessionDurationMin: buildSetpoint('sessionDurationMin'),
      sessionsPerWeek: buildSetpoint('sessionsPerWeek'),
      weeklyKm: buildSetpoint('weeklyKm'),
      preferredRunTypes: buildList<string>('preferredRunTypes'),
      avoidedRunTypes: buildList<string>('avoidedRunTypes'),
      splitPreference: buildStringSetpoint('splitPreference'),
      exercisesPerSession: buildSetpoint('exercisesPerSession'),
      defaultSets: buildSetpoint('defaultSets'),
      defaultReps: buildSetpoint('defaultReps'),
      targetMuscleGroups: buildList<string>('targetMuscleGroups'),
      exercisePrescriptions: this.buildPrescriptions(prescriptionEvents, now),
      experienceLevel: buildStringSetpoint('experienceLevel'),
      primaryGoal: buildStringSetpoint('primaryGoal'),
      sourceEventCount: relevant.length,
      taxonomyVersion: CURRENT_TAXONOMY_VERSION,
      rebuiltAt: now.toISOString(),
    };
  }

  /* ── per-event routing ───────────────────────────────────────── */

  private biasSliceFor(event: PreferenceEvent): BiasSlice | null {
    switch (event.tag.type) {
      case 'volume_bias':
      case 'volume_too_high':
      case 'volume_too_low':
        return 'volumeBias';
      case 'intensity_bias':
      case 'too_hard':
      case 'too_easy':
        return 'intensityBias';
      case 'diversity_request':
        return 'diversityBias';
      default:
        return null;
    }
  }

  private setpointSliceFor(event: PreferenceEvent): SetpointSlice | null {
    switch (event.tag.type) {
      case 'session_duration':
        return 'sessionDurationMin';
      case 'sessions_per_week':
        return 'sessionsPerWeek';
      case 'weekly_km':
        return 'weeklyKm';
      case 'split_preference':
        return 'splitPreference';
      case 'exercises_per_session':
        return 'exercisesPerSession';
      case 'default_sets':
        return 'defaultSets';
      case 'default_reps':
        return 'defaultReps';
      case 'experience_level':
        return 'experienceLevel';
      case 'primary_goal':
        return 'primaryGoal';
      default:
        return null;
    }
  }

  private listCandidateFor(event: PreferenceEvent): ListCandidate | null {
    const t = event.tag;
    switch (t.type) {
      case 'disliked_exercise': {
        const id = this.resolveExerciseId(event);
        return id ? { slice: 'avoidedExercises', key: id, value: id } : null;
      }
      case 'exercise_override': {
        const id = this.resolveExerciseId(event);
        if (!id) {
          return null;
        }
        const slice: ListSlice =
          t.polarity === 'prefer' || t.polarity === 'increase'
            ? 'preferredExercises'
            : 'avoidedExercises';
        return { slice, key: id, value: id };
      }
      case 'equipment_removed': {
        const v = this.stringValue(event);
        return v ? { slice: 'removedEquipment', key: v, value: v } : null;
      }
      case 'equipment_added': {
        const v = this.stringValue(event);
        return v ? { slice: 'addedEquipment', key: v, value: v } : null;
      }
      case 'modality_pref': {
        const v = this.stringValue(event);
        return v ? { slice: 'preferredModalities', key: v, value: v } : null;
      }
      case 'run_type_pref': {
        const v = this.runTypeValue(event);
        if (!v) {
          return null;
        }
        const slice: ListSlice =
          t.polarity === 'avoid' || t.polarity === 'decrease'
            ? 'avoidedRunTypes'
            : 'preferredRunTypes';
        return { slice, key: v, value: v };
      }
      case 'muscle_group_pref': {
        const v = this.stringValue(event);
        return v ? { slice: 'targetMuscleGroups', key: v, value: v } : null;
      }
      case 'disliked_time':
      case 'time_window_blocked': {
        const w = this.parseTimeWindow(t.value);
        return w
          ? { slice: 'blockedTimeWindows', key: windowKey(w), value: w }
          : null;
      }
      case 'time_window_preferred': {
        const w = this.parseTimeWindow(t.value);
        return w
          ? { slice: 'preferredTimeWindows', key: windowKey(w), value: w }
          : null;
      }
      default:
        // Contextual one-offs, injuries, and 'other' never reach the projection.
        return null;
    }
  }

  private buildBias(
    events: PreferenceEvent[],
    baseStep: number,
    now: Date,
  ): PrefEntry<number> | null {
    if (events.length === 0) {
      return null;
    }
    const sum = events.reduce((acc, e) => acc + this.numericStep(e, baseStep), 0);
    const value = clamp(sum, -maxBias, maxBias);
    if (value === 0) {
      return null; // conflicting signals cancelled out — no net bias.
    }
    const entry = this.promotion.buildEntry<number>(
      value,
      events,
      inferredDislikeSupport,
      now,
    );
    return entry;
  }

  /**
   * Latest-explicit-value-wins. Of the slice's events, the newest by `eventDate`
   * defines the current value; only the events carrying that same value back it,
   * so an old superseded onboarding number never inflates the support of the new
   * one. Reuses `buildEntry`, so explicit setpoints land hard at N=1.
   */
  private buildSetpointEntry<T>(
    events: PreferenceEvent[],
    extract: (e: PreferenceEvent) => T | null,
    keyOf: (v: T) => string,
    now: Date,
  ): PrefEntry<T> | null {
    const valued = events
      .map((e) => ({ e, v: extract(e) }))
      .filter((x): x is { e: PreferenceEvent; v: T } => x.v !== null);
    if (valued.length === 0) {
      return null;
    }
    const latest = valued.reduce((a, b) =>
      b.e.eventDate >= a.e.eventDate ? b : a,
    );
    const winKey = keyOf(latest.v);
    const supporting = valued
      .filter((x) => keyOf(x.v) === winKey)
      .map((x) => x.e);
    return this.promotion.buildEntry<T>(
      latest.v,
      supporting,
      inferredLikeSupport,
      now,
    );
  }

  /** Per-exercise prescriptions: one latest-value-wins setpoint per exercise id. */
  private buildPrescriptions(
    events: PreferenceEvent[],
    now: Date,
  ): PrefEntry<ExercisePrescription>[] {
    const byKey = new Map<string, PreferenceEvent[]>();
    for (const event of events) {
      const p = this.parsePrescription(event);
      if (!p) {
        continue;
      }
      const bucket = byKey.get(p.exerciseId) ?? [];
      bucket.push(event);
      byKey.set(p.exerciseId, bucket);
    }
    const out: PrefEntry<ExercisePrescription>[] = [];
    for (const group of byKey.values()) {
      const entry = this.buildSetpointEntry<ExercisePrescription>(
        group,
        (e) => this.parsePrescription(e),
        (v) => `${v.exerciseId}|${v.sets}|${v.reps}|${v.weightKg}`,
        now,
      );
      if (entry) {
        out.push(entry);
      }
    }
    return out.sort((a, b) => b.supportCount - a.supportCount);
  }

  /* ── value extraction helpers ────────────────────────────────── */

  private resolveExerciseId(event: PreferenceEvent): string | null {
    const direct = event.target?.exerciseId ?? null;
    if (direct && this.exercises.isValidId(direct)) {
      return direct;
    }
    if (typeof event.tag.value === 'string') {
      return this.exercises.resolveId(event.tag.value);
    }
    return null;
  }

  private stringValue(event: PreferenceEvent): string | null {
    return typeof event.tag.value === 'string' && event.tag.value.length > 0
      ? event.tag.value
      : null;
  }

  private runTypeValue(event: PreferenceEvent): string | null {
    return event.target?.runType ?? this.stringValue(event);
  }

  /**
   * Parse a prescription event into structured truth. Encoded scalar form:
   *   "barbell_bench_press|sets=4|reps=8|kg=60"
   * The exercise id may instead ride on `target.exerciseId`; the head token (if
   * any) is resolved through the catalog, mirroring `parseTimeWindow`.
   */
  private parsePrescription(event: PreferenceEvent): ExercisePrescription | null {
    const raw = typeof event.tag.value === 'string' ? event.tag.value : '';
    const parts = raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);

    let exerciseId =
      event.target?.exerciseId && this.exercises.isValidId(event.target.exerciseId)
        ? event.target.exerciseId
        : null;
    const dials: { sets?: number; reps?: number; kg?: number } = {};

    for (const part of parts) {
      const kv = part.match(/^(sets|reps|kg|weight)\s*=\s*(\d+(?:\.\d+)?)$/i);
      if (kv) {
        const key = kv[1].toLowerCase() === 'weight' ? 'kg' : kv[1].toLowerCase();
        dials[key as 'sets' | 'reps' | 'kg'] = Number(kv[2]);
      } else if (!exerciseId) {
        exerciseId = this.exercises.resolveId(part);
      }
    }

    if (!exerciseId) {
      return null;
    }
    return {
      exerciseId,
      sets: dials.sets ?? null,
      reps: dials.reps ?? null,
      weightKg: dials.kg ?? null,
    };
  }

  private numericStep(event: PreferenceEvent, baseStep: number): number {
    if (typeof event.tag.value === 'number') {
      return event.tag.value;
    }
    switch (event.tag.polarity) {
      case 'increase':
      case 'prefer':
        return baseStep;
      case 'decrease':
      case 'avoid':
        return -baseStep;
      default:
        return 0;
    }
  }

  private parseTimeWindow(raw: string | number | null): TimeWindow | null {
    if (typeof raw !== 'string') {
      return null;
    }
    const m = raw
      .trim()
      .toLowerCase()
      .match(
        /^(mon|tue|wed|thu|fri|sat|sun|\*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/,
      );
    return m ? { day: m[1], start: m[2], end: m[3] } : null;
  }
}

const windowKey = (w: TimeWindow): string => `${w.day}|${w.start}|${w.end}`;
