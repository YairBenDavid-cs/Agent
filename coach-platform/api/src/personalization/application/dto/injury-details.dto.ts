import { ArrayUnique, IsIn, IsOptional, IsString } from 'class-validator';
import { MovementPattern } from '../../../exercises/domain/exercise-catalog.model';
import { MuscleGroup } from '../../../training/domain/training-profile.model';
import { ConstraintSeverity } from '../../domain/health-constraint.model';

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
 * Injury payload embedded in a preference item. When present, the ingestion path
 * also creates a `health_constraint` (expanded to canonical avoid-ids) and links
 * it to the produced event for provenance.
 */
export class InjuryDetailsDto {
  @IsOptional() @IsString() label?: string;

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
}
