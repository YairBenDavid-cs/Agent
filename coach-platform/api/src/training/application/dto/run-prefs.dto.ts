import {
  ArrayMaxSize,
  ArrayUnique,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ExperienceLevel,
  RunType,
} from '../../domain/training-profile.model';

/** "m:ss" or "mm:ss" or "h:mm:ss" — a plausible 5k time, never a free-form string. */
const RACE_TIME = /^(\d{1,2}:)?[0-5]?\d:[0-5]\d$/;

/** Running-branch preferences. Required when discipline === 'running'. */
export class RunPrefsDto {
  @IsNumber()
  @Min(0)
  @Max(300)
  weeklyKm!: number;

  @IsIn(['easy', 'tempo', 'fartlek', 'intervals', 'long', 'recovery'], {
    each: true,
  })
  @ArrayUnique()
  @ArrayMaxSize(6)
  likedRunTypes!: RunType[];

  @IsOptional()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: ExperienceLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  longestRecentKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetRace?: string;

  @IsOptional()
  @IsString()
  @Matches(RACE_TIME, {
    message: 'recent5kTime must be "mm:ss" or "h:mm:ss".',
  })
  recent5kTime?: string;
}
