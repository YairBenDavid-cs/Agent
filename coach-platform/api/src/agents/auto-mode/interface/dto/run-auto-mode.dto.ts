import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AutoModeScenario } from '../../domain/auto-mode-run.model';

export class WeeklyTargetsEditRequestDto {
  @IsOptional() @IsInt() @IsPositive() sessionCount?: number;

  @IsOptional() @IsNumber() @IsPositive() totalVolume?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) keyGoals?: string[];

  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}

export class SessionEditRequestDto {
  @IsString() plannedSessionId!: string;

  @IsString() @MinLength(1) @MaxLength(1000) requestedChangeDescription!: string;
}

export class SessionTimeEditRequestDto {
  @IsString() plannedSessionId!: string;

  @IsOptional() @IsISO8601({ strict: true }) requestedDate?: string;

  @IsOptional() @IsString() requestedStartTime?: string;
}

/**
 * Explicit manual-trigger payload for `POST .../auto-mode/run` (M4.5, and the
 * UI's "Auto Mode" button). Unlike a chat message, the scenario + request are
 * given directly — no free-text classification step runs for this path.
 */
export class RunAutoModeDto {
  @IsIn(['new_week', 'weekly_targets_edit', 'session_edit', 'session_time_edit'])
  scenario!: AutoModeScenario;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WeeklyTargetsEditRequestDto)
  weeklyTargetsEditRequest?: WeeklyTargetsEditRequestDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SessionEditRequestDto)
  sessionEditRequest?: SessionEditRequestDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SessionTimeEditRequestDto)
  sessionTimeEditRequest?: SessionTimeEditRequestDto;
}
