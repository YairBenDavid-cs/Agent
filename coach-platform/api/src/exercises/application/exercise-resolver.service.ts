import { Injectable } from '@nestjs/common';
import type {
  MovementPattern,
} from '../domain/exercise-catalog.model';
import {
  CatalogExercise,
  EXERCISE_CATALOG,
  getExerciseById,
  getExercisesByMovementPattern,
  getExercisesByMuscle,
  resolveExerciseId,
} from '../domain/exercise-catalog.model';
import type { MuscleGroup } from '../../training/domain/training-profile.model';

/**
 * Thin application-layer wrapper over the static exercise catalog. Centralises
 * free-text -> canonical-id resolution so every producer (generator output,
 * Garmin ingestion, the assistant) funnels through one place.
 *
 * The catalog itself is in-memory and immutable, so this service holds no state
 * beyond what the model exposes.
 */
@Injectable()
export class ExerciseResolverService {
  /** Resolve a single free-text mention to a canonical id, or null if unknown. */
  resolveId(raw: string): string | null {
    return resolveExerciseId(raw);
  }

  /** Full catalog entry by canonical id. */
  getById(id: string): CatalogExercise | undefined {
    return getExerciseById(id);
  }

  /** True when the id exists in the catalog (used by the generation validator). */
  isValidId(id: string): boolean {
    return getExerciseById(id) !== undefined;
  }

  /**
   * Partition a batch of free-text names into resolved ids and unresolved
   * leftovers. Ingestion stores the unresolved set for review rather than
   * dropping it (Phase 6 behaviour, exposed here for reuse).
   */
  resolveMany(raws: string[]): { resolved: string[]; unresolved: string[] } {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    for (const raw of raws) {
      const id = this.resolveId(raw);
      if (id) {
        resolved.push(id);
      } else {
        unresolved.push(raw);
      }
    }
    return { resolved, unresolved };
  }

  /** The full canonical id list — handed to the generator so it emits ids only. */
  allIds(): string[] {
    return EXERCISE_CATALOG.map((e) => e.id);
  }

  /** Canonical ids loading a muscle (primary or secondary) — injury expansion. */
  idsByMuscle(muscle: MuscleGroup): string[] {
    return getExercisesByMuscle(muscle).map((e) => e.id);
  }

  /** Canonical ids sharing a movement pattern — injury expansion. */
  idsByMovementPattern(pattern: MovementPattern): string[] {
    return getExercisesByMovementPattern(pattern).map((e) => e.id);
  }
}
