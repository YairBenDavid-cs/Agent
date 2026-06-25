import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SessionType } from '../../domain/workout-session.model';

export class RunningSplitDto {
  @IsOptional() @IsNumber() distance_m?: number | null;
  @IsOptional() @IsString() pace?: string | null;
  @IsOptional() @IsNumber() avg_hr?: number | null;
}

export class RunningDetailDto {
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsNumber() distance_km?: number | null;
  @IsOptional() @IsNumber() duration_min?: number | null;
  @IsOptional() @IsString() avg_pace?: string | null;
  @IsOptional() @IsNumber() avg_hr?: number | null;
  @IsOptional() @IsNumber() max_hr?: number | null;
  @IsOptional() @IsNumber() aerobic_te?: number | null;
  @IsOptional() @IsNumber() anaerobic_te?: number | null;
  @IsOptional() @IsString() te_label?: string | null;
  @IsOptional() @IsNumber() training_load?: number | null;
  @IsOptional() @IsNumber() calories?: number | null;
  @IsOptional() @IsNumber() elevation_gain_m?: number | null;
  @IsOptional() @IsNumber() avg_cadence?: number | null;
  @IsOptional() @IsNumber() avg_stride_length_cm?: number | null;
  @IsOptional() @IsNumber() avg_ground_contact_ms?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RunningSplitDto)
  splits?: RunningSplitDto[];
}

export class ExerciseAggregateDto {
  @IsString() category!: string;
  @IsOptional() @IsInt() sets?: number;
  @IsOptional() @IsInt() reps?: number;
  @IsOptional() @IsNumber() top_weight_kg?: number;
  @IsOptional() @IsNumber() volume_load?: number;
  @IsOptional() @IsNumber() est_1rm_kg?: number;
}

export class StrengthDetailDto {
  @IsOptional() @IsString() name?: string | null;
  @IsOptional() @IsNumber() duration_min?: number | null;
  @IsOptional() @IsNumber() avg_hr?: number | null;
  @IsOptional() @IsNumber() max_hr?: number | null;
  @IsOptional() @IsNumber() calories?: number | null;
  @IsOptional() @IsNumber() aerobic_te?: number | null;
  @IsOptional() @IsNumber() anaerobic_te?: number | null;
  @IsOptional() @IsString() te_label?: string | null;
  @IsOptional() @IsNumber() training_load?: number | null;
  @IsOptional() @IsInt() total_sets?: number | null;
  @IsOptional() @IsInt() total_reps?: number | null;
  @IsOptional() @IsNumber() session_volume_load?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseAggregateDto)
  exercises?: ExerciseAggregateDto[];
}

/** Published contract for one workout. Only the detail matching `type` is set. */
export class SessionDto {
  @IsInt() activityId!: number;

  @IsISO8601({ strict: true }) date!: string;

  @IsIn(['running', 'strength']) type!: SessionType;

  @IsOptional() @IsString() subtype?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RunningDetailDto)
  running?: RunningDetailDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => StrengthDetailDto)
  strength?: StrengthDetailDto | null;
}
