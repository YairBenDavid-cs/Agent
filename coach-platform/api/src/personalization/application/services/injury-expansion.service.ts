import { Injectable } from '@nestjs/common';
import { ExerciseResolverService } from '../../../exercises/application/exercise-resolver.service';
import { MovementPattern } from '../../../exercises/domain/exercise-catalog.model';
import { MuscleGroup } from '../../../training/domain/training-profile.model';

export interface InjuryExpansionInput {
  affectedMuscles: MuscleGroup[];
  affectedMovementPatterns: MovementPattern[];
  /** Extra ids the caller already knows to exclude (e.g. user named them). */
  explicitExerciseIds?: string[];
}

/**
 * Turns an injury described in human terms (muscles + movement patterns) into
 * the concrete set of canonical exercise ids the generator must avoid. Done
 * ONCE at write time so the generation hot path never re-interprets an injury.
 *
 * Union semantics: an exercise is excluded if it loads ANY affected muscle
 * (primary or secondary) OR matches ANY affected movement pattern.
 */
@Injectable()
export class InjuryExpansionService {
  constructor(private readonly exercises: ExerciseResolverService) {}

  expand(input: InjuryExpansionInput): string[] {
    const ids = new Set<string>();

    for (const muscle of input.affectedMuscles) {
      for (const id of this.exercises.idsByMuscle(muscle)) {
        ids.add(id);
      }
    }
    for (const pattern of input.affectedMovementPatterns) {
      for (const id of this.exercises.idsByMovementPattern(pattern)) {
        ids.add(id);
      }
    }
    for (const id of input.explicitExerciseIds ?? []) {
      if (this.exercises.isValidId(id)) {
        ids.add(id);
      }
    }

    return [...ids].sort();
  }
}
