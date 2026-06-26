import { Type } from 'class-transformer';
import { IsNumber, IsOptional, ValidateNested } from 'class-validator';

export class PerformanceRunningDailyDto {
  @IsOptional() @IsNumber() running_tolerance?: number | null;
  @IsOptional() @IsNumber() weekly_distance_km?: number | null;
  @IsOptional() @IsNumber() weekly_intensity_moderate?: number | null;
  @IsOptional() @IsNumber() weekly_intensity_vigorous?: number | null;
}

export class PerformanceStrengthDailyDto {
  @IsOptional() @IsNumber() weekly_volume_load?: number | null;
}

/** Published contract for a day's rolling performance aggregates. */
export class PerformanceMetricsDto {
  @ValidateNested()
  @Type(() => PerformanceRunningDailyDto)
  running!: PerformanceRunningDailyDto;

  @ValidateNested()
  @Type(() => PerformanceStrengthDailyDto)
  strength!: PerformanceStrengthDailyDto;
}
