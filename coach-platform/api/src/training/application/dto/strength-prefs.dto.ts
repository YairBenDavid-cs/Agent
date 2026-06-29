import {
  ArrayMaxSize,
  ArrayUnique,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  Equipment,
  ExperienceLevel,
  MuscleGroup,
  SplitPreference,
  TrainingModality,
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
  @ArrayMaxSize(8)
  targetMuscleGroups!: MuscleGroup[];

  @IsInt()
  @Min(1)
  @Max(50)
  exercisesPerSession!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  setsPerExercise!: number;

  @IsInt()
  @Min(1)
  @Max(100)
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
  @MaxLength(80, { each: true })
  @ArrayMaxSize(50)
  preferredExercises?: string[];

  @IsOptional()
  @IsIn(
    [
      'gym',
      'crossfit',
      'hyrox',
      'hiit',
      'calisthenics',
      'powerlifting',
      'bodybuilding',
    ],
    { each: true },
  )
  @ArrayUnique()
  trainingModalities?: TrainingModality[];

  @IsOptional()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsIn(['full_body', 'upper_lower', 'push_pull_legs', 'bro_split'])
  splitPreference?: SplitPreference;
}
