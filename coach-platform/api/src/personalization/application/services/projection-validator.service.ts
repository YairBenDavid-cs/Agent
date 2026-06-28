import { Injectable, Logger } from '@nestjs/common';
import { PERSONALIZATION_CONFIG } from '../../domain/personalization.config';
import {
  ExercisePrescription,
  PrefEntry,
  TimeWindow,
} from '../../domain/pref-entry.model';
import { UserPreferences } from '../../domain/user-preferences.model';

/** A single invariant breach found (and repaired) on a projection. */
export interface ProjectionViolation {
  slice: string;
  kind:
    | 'inferred_hard' // inference alone reached hard — capped at soft
    | 'decayed_not_pruned' // soft/inferred entry past the decay horizon
    | 'bias_out_of_range' // |bias| exceeded maxBias
    | 'missing_provenance' // entry with no sourceEventIds
    | 'support_count_mismatch' // supportCount ≠ sourceEventIds.length
    | 'duplicate_entry'; // same value present twice in a slice
  detail: string;
}

const LIST_SLICES = [
  'avoidedExercises',
  'preferredExercises',
  'blockedTimeWindows',
  'preferredTimeWindows',
  'removedEquipment',
  'addedEquipment',
  'preferredModalities',
  'preferredRunTypes',
  'avoidedRunTypes',
  'targetMuscleGroups',
  'exercisePrescriptions',
] as const;
type ListSliceName = (typeof LIST_SLICES)[number];

const BIAS_SLICES = ['volumeBias', 'intensityBias', 'diversityBias'] as const;
type BiasSliceName = (typeof BIAS_SLICES)[number];

/** Single-valued setpoint slices (latest-value-wins; same per-entry invariants). */
const SETPOINT_SLICES = [
  'sessionDurationMin',
  'sessionsPerWeek',
  'weeklyKm',
  'splitPreference',
  'exercisesPerSession',
  'defaultSets',
  'defaultReps',
  'experienceLevel',
  'primaryGoal',
] as const;
type SetpointSliceName = (typeof SETPOINT_SLICES)[number];

const { decayDays, maxBias } = PERSONALIZATION_CONFIG;
const MS_PER_DAY = 86_400_000;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

function keyOf(value: unknown): string {
  if (value && typeof value === 'object' && 'day' in (value as TimeWindow)) {
    const w = value as TimeWindow;
    return `${w.day}|${w.start}|${w.end}`;
  }
  if (value && typeof value === 'object' && 'exerciseId' in (value as object)) {
    // Per-exercise prescriptions dedupe by movement (one truth per exercise).
    return (value as ExercisePrescription).exerciseId;
  }
  return String(value);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return (to - from) / MS_PER_DAY;
}

/**
 * The enforcement gate that sits between distillation and persistence. The
 * distiller already encodes the promotion/decay rules, so this is defense in
 * depth: it re-checks every invariant the generator relies on, REPAIRS any
 * breach (so a bad event stream can never poison the projection a future agent
 * obeys), and surfaces the violations for audit.
 *
 * Invariants (mirroring personalization.config):
 *   - inference ALONE never becomes hard — soft is its ceiling.
 *   - soft/inferred entries past `decayDays` must not survive a rebuild.
 *   - |bias| never exceeds `maxBias`.
 *   - every entry carries provenance, and `supportCount` matches it.
 *   - no slice holds the same value twice.
 */
@Injectable()
export class ProjectionValidatorService {
  private readonly logger = new Logger(ProjectionValidatorService.name);

  /** Pure check — returns the breaches without mutating. Handy for tests. */
  validate(prefs: UserPreferences): ProjectionViolation[] {
    return this.process(prefs).violations;
  }

  /** Repair the projection in place-of-a-copy, logging any breaches found. */
  enforce(prefs: UserPreferences): UserPreferences {
    const { projection, violations } = this.process(prefs);
    if (violations.length > 0) {
      this.logger.warn(
        `Projection (${prefs.userId}/${prefs.discipline}) had ${violations.length} invariant breach(es), repaired: ` +
          violations.map((v) => `${v.slice}:${v.kind}`).join(', '),
      );
    }
    return projection;
  }

  /* ── single-pass detect + repair ─────────────────────────────── */

  private process(prefs: UserPreferences): {
    projection: UserPreferences;
    violations: ProjectionViolation[];
  } {
    const violations: ProjectionViolation[] = [];
    const reference = prefs.rebuiltAt; // decay measured against the rebuild time

    const lists: Record<ListSliceName, PrefEntry<string | TimeWindow>[]> =
      {} as Record<ListSliceName, PrefEntry<string | TimeWindow>[]>;
    for (const slice of LIST_SLICES) {
      lists[slice] = this.cleanList(
        slice,
        prefs[slice] as PrefEntry<string | TimeWindow>[],
        reference,
        violations,
      );
    }

    const biases: Record<BiasSliceName, PrefEntry<number> | null> = {
      volumeBias: this.cleanBias(
        'volumeBias',
        prefs.volumeBias,
        reference,
        violations,
      ),
      intensityBias: this.cleanBias(
        'intensityBias',
        prefs.intensityBias,
        reference,
        violations,
      ),
      diversityBias: this.cleanBias(
        'diversityBias',
        prefs.diversityBias,
        reference,
        violations,
      ),
    };

    const setpoints = {} as Record<
      SetpointSliceName,
      PrefEntry<string | number> | null
    >;
    for (const slice of SETPOINT_SLICES) {
      setpoints[slice] = this.cleanSetpoint(
        slice,
        prefs[slice] as PrefEntry<string | number> | null,
        reference,
        violations,
      );
    }

    const projection: UserPreferences = {
      ...prefs,
      avoidedExercises: lists.avoidedExercises as PrefEntry<string>[],
      preferredExercises: lists.preferredExercises as PrefEntry<string>[],
      blockedTimeWindows: lists.blockedTimeWindows as PrefEntry<TimeWindow>[],
      preferredTimeWindows: lists.preferredTimeWindows as PrefEntry<TimeWindow>[],
      removedEquipment: lists.removedEquipment as PrefEntry<string>[],
      addedEquipment: lists.addedEquipment as PrefEntry<string>[],
      preferredModalities: lists.preferredModalities as PrefEntry<string>[],
      preferredRunTypes: lists.preferredRunTypes as PrefEntry<string>[],
      avoidedRunTypes: lists.avoidedRunTypes as PrefEntry<string>[],
      targetMuscleGroups: lists.targetMuscleGroups as PrefEntry<string>[],
      exercisePrescriptions:
        lists.exercisePrescriptions as unknown as PrefEntry<ExercisePrescription>[],
      volumeBias: biases.volumeBias,
      intensityBias: biases.intensityBias,
      diversityBias: biases.diversityBias,
      sessionDurationMin: setpoints.sessionDurationMin as PrefEntry<number> | null,
      sessionsPerWeek: setpoints.sessionsPerWeek as PrefEntry<number> | null,
      weeklyKm: setpoints.weeklyKm as PrefEntry<number> | null,
      splitPreference: setpoints.splitPreference as PrefEntry<string> | null,
      exercisesPerSession:
        setpoints.exercisesPerSession as PrefEntry<number> | null,
      defaultSets: setpoints.defaultSets as PrefEntry<number> | null,
      defaultReps: setpoints.defaultReps as PrefEntry<number> | null,
      experienceLevel: setpoints.experienceLevel as PrefEntry<string> | null,
      primaryGoal: setpoints.primaryGoal as PrefEntry<string> | null,
    };

    return { projection, violations };
  }

  private cleanList(
    slice: string,
    entries: PrefEntry<string | TimeWindow>[],
    reference: string,
    violations: ProjectionViolation[],
  ): PrefEntry<string | TimeWindow>[] {
    const seen = new Set<string>();
    const out: PrefEntry<string | TimeWindow>[] = [];

    for (const entry of entries ?? []) {
      const repaired = this.repairEntry(slice, entry, reference, violations);
      if (!repaired) continue; // dropped (decayed or no provenance)

      const key = keyOf(repaired.value);
      if (seen.has(key)) {
        violations.push({
          slice,
          kind: 'duplicate_entry',
          detail: `dropped duplicate value "${key}"`,
        });
        continue;
      }
      seen.add(key);
      out.push(repaired);
    }
    return out;
  }

  private cleanBias(
    slice: string,
    entry: PrefEntry<number> | null,
    reference: string,
    violations: ProjectionViolation[],
  ): PrefEntry<number> | null {
    if (!entry) return null;
    const repaired = this.repairEntry(slice, entry, reference, violations) as
      | PrefEntry<number>
      | null;
    if (!repaired) return null;

    if (repaired.value < -maxBias || repaired.value > maxBias) {
      violations.push({
        slice,
        kind: 'bias_out_of_range',
        detail: `clamped ${repaired.value} to [${-maxBias}, ${maxBias}]`,
      });
      repaired.value = clamp(repaired.value, -maxBias, maxBias);
    }
    return repaired;
  }

  /** Setpoint slices share the per-entry invariants but have no value clamp. */
  private cleanSetpoint(
    slice: string,
    entry: PrefEntry<string | number> | null,
    reference: string,
    violations: ProjectionViolation[],
  ): PrefEntry<string | number> | null {
    if (!entry) return null;
    return this.repairEntry(slice, entry, reference, violations);
  }

  /** Shared per-entry invariants. Returns null when the entry must be dropped. */
  private repairEntry<T>(
    slice: string,
    entry: PrefEntry<T>,
    reference: string,
    violations: ProjectionViolation[],
  ): PrefEntry<T> | null {
    const sourceEventIds = entry.sourceEventIds ?? [];
    if (sourceEventIds.length === 0) {
      violations.push({
        slice,
        kind: 'missing_provenance',
        detail: 'dropped entry with no sourceEventIds',
      });
      return null;
    }

    const next: PrefEntry<T> = { ...entry, sourceEventIds: [...sourceEventIds] };

    // inference alone can never be hard — soft is its ceiling unless confirmed.
    if (
      next.strength === 'hard' &&
      next.confidence === 'inferred' &&
      !next.confirmed
    ) {
      violations.push({
        slice,
        kind: 'inferred_hard',
        detail: 'demoted unconfirmed inferred entry from hard to soft',
      });
      next.strength = 'soft';
    }

    // hard + explicit never decay; everything else is subject to the horizon.
    const decays = !(next.strength === 'hard' && next.confidence === 'explicit');
    if (decays && daysBetween(next.lastReinforced, reference) > decayDays) {
      violations.push({
        slice,
        kind: 'decayed_not_pruned',
        detail: `dropped entry stale by >${decayDays}d`,
      });
      return null;
    }

    if (next.supportCount !== next.sourceEventIds.length) {
      violations.push({
        slice,
        kind: 'support_count_mismatch',
        detail: `reset supportCount ${next.supportCount} -> ${next.sourceEventIds.length}`,
      });
      next.supportCount = next.sourceEventIds.length;
    }

    return next;
  }
}
