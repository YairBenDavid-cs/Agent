import {
  ArrayUnique,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ExperienceLevel,
  RunType,
} from '../../domain/training-profile.model';

/** Running-branch preferences. Required when discipline === 'running'. */
export class RunPrefsDto {
  @IsNumber()
  @Min(0)
  weeklyKm!: number;

  @IsIn(['easy', 'tempo', 'fartlek', 'intervals', 'long', 'recovery'], {
    each: true,
  })
  @ArrayUnique()
  likedRunTypes!: RunType[];

  @IsOptional()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  longestRecentKm?: number;

  @IsOptional()
  @IsString()
  targetRace?: string;

  @IsOptional()
  @IsString()
  recent5kTime?: string;
}
