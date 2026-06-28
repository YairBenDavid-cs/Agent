import {
  CatalogExercise,
  EXERCISE_CATALOG,
  getExerciseById,
  normalizeExerciseName,
} from '../../../exercises/domain/exercise-catalog.model';
import {
  GetExerciseDetailArgs,
  SearchExerciseCatalogArgs,
} from './read-tools.schemas';

/** Compact projection — keeps tool results token-cheap; full record via detail. */
export interface CatalogSearchHit {
  id: string;
  name: string;
  category: string;
  primaryMuscle: string;
  equipment: string[];
  movementPattern: string;
  isCompound: boolean;
  difficulty: string;
}

function toHit(e: CatalogExercise): CatalogSearchHit {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    primaryMuscle: e.primaryMuscle,
    equipment: e.equipment,
    movementPattern: e.movementPattern,
    isCompound: e.isCompound,
    difficulty: e.difficulty,
  };
}

/**
 * Equipment/constraint-aware catalog search over the 700+ entry in-memory
 * catalog. All filters are AND-combined; `text` matches id/name/aliases after
 * normalization. Framework-free so it can be reused by any agent's read-tool.
 */
export function searchExerciseCatalog(
  args: SearchExerciseCatalogArgs,
): CatalogSearchHit[] {
  const text = args.text ? normalizeExerciseName(args.text) : null;
  const muscle = args.muscle?.toLowerCase();
  const pattern = args.movementPattern?.toLowerCase();
  const equipment = args.equipment?.toLowerCase();
  const difficulty = args.difficulty;

  const matches = EXERCISE_CATALOG.filter((e) => {
    if (
      text &&
      !normalizeExerciseName(e.name).includes(text) &&
      !e.id.includes(text) &&
      !e.aliases.some((a) => normalizeExerciseName(a).includes(text))
    ) {
      return false;
    }
    if (muscle && e.primaryMuscle.toLowerCase() !== muscle) {
      return false;
    }
    if (pattern && e.movementPattern.toLowerCase() !== pattern) {
      return false;
    }
    if (
      equipment &&
      !e.equipment.some((eq) => eq.toLowerCase() === equipment)
    ) {
      return false;
    }
    if (difficulty && e.difficulty !== difficulty) {
      return false;
    }
    return true;
  });

  return matches.slice(0, args.limit).map(toHit);
}

/** Full catalog record for one id, or null if unknown. */
export function getExerciseDetail(
  args: GetExerciseDetailArgs,
): CatalogExercise | null {
  return getExerciseById(args.exerciseId) ?? null;
}
