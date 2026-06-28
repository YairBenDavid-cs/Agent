import { ArrayUnique, IsIn, IsOptional, IsString } from 'class-validator';
import { MovementPattern } from '../../../exercises/domain/exercise-catalog.model';
import { MuscleGroup } from '../../../training/domain/training-profile.model';
import {
  ConstraintSeverity,
  ConstraintType,
} from '../../domain/health-constraint.model';

const TYPES: ConstraintType[] = [
  'injury',
  'mobility_limitation',
  'medical',
  'other',
];
const SEVERITIES: ConstraintSeverity[] = ['avoid', 'caution'];
const MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
  'full_body',
];
const MOVEMENT_PATTERNS: MovementPattern[] = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'carry',
  'core',
  'isolation',
  'olympic',
  'plyometric',
];

/**
 * Record an injury / limitation. The producer supplies the human description
 * (muscles, movement patterns); the handler expands it to canonical
 * `avoidExerciseIds`. At least one of muscles / patterns / explicit ids should
 * be present for the expansion to exclude anything.
 */
export class AddHealthConstraintDto {
  @IsIn(TYPES) type!: ConstraintType;

  @IsString() label!: string;

  @IsOptional()
  @IsIn(MUSCLES, { each: true })
  @ArrayUnique()
  affectedMuscles?: MuscleGroup[];

  @IsOptional()
  @IsIn(MOVEMENT_PATTERNS, { each: true })
  @ArrayUnique()
  affectedMovementPatterns?: MovementPattern[];

  @IsOptional()
  @IsString({ each: true })
  @ArrayUnique()
  explicitExerciseIds?: string[];

  @IsIn(SEVERITIES) severity!: ConstraintSeverity;

  @IsOptional()
  @IsString({ each: true })
  sourceEventIds?: string[];
}
