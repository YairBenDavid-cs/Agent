import {
  ArrayUnique,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  Equipment,
  ExperienceLevel,
  MuscleGroup,
  SplitPreference,
} from '../../domain/training-profile.model';

/** Strength-branch preferences. Required when discipline === 'strength'. */
export class StrengthPrefsDto {
  @IsIn(
    [
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'glutes',
      'core',
      'full_body',
    ],
    { each: true },
  )
  @ArrayUnique()
  targetMuscleGroups!: MuscleGroup[];

  @IsInt()
  @Min(1)
  exercisesPerSession!: number;

  @IsInt()
  @Min(1)
  setsPerExercise!: number;

  @IsInt()
  @Min(1)
  repsPerExercise!: number;

  @IsIn(
    [
      'bodyweight',
      'dumbbells',
      'barbell',
      'kettlebell',
      'machines',
      'resistance_bands',
      'cables',
      'pullup_bar',
    ],
    { each: true },
  )
  @ArrayUnique()
  equipment!: Equipment[];

  @IsOptional()
  @IsString({ each: true })
  preferredExercises?: string[];

  @IsOptional()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsIn(['full_body', 'upper_lower', 'push_pull_legs', 'bro_split'])
  splitPreference?: SplitPreference;
}
