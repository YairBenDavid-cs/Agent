import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IngestionStatus } from '../../../recovery/domain/recovery-day.model';
import { RecoveryMetricsDto } from '../../../recovery/application/dto/recovery-metrics.dto';
import { PerformanceMetricsDto } from '../../../performance/application/dto/performance-metrics.dto';
import { ProfileCandidateDto } from '../../../performance/application/dto/profile-candidate.dto';
import { SessionDto } from '../../../sessions/application/dto/session.dto';

/**
 * Validated contract for what the Python fetch service returns. The service is
 * untrusted I/O at the system boundary, so its response is validated with the
 * same DTOs the rest of the app already publishes — one source of truth for the
 * metric shapes.
 */

export class IngestionWarningDto {
  @IsString() field!: string;
  @IsString() reason!: string;
}

/** A freshly minted Garmin session the fetch service authenticated with, so we
 * can cache it and avoid logging in on every run. */
export class GarminSessionDto {
  @IsString() @MinLength(1) token!: string;
  @IsISO8601({ strict: true }) expiresAt!: string;
}

export class FetchedDayDto {
  @IsISO8601({ strict: true }) date!: string;

  @IsIn(['ok', 'partial', 'failed']) status!: IngestionStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestionWarningDto)
  warnings!: IngestionWarningDto[];

  @ValidateNested()
  @Type(() => RecoveryMetricsDto)
  recovery!: RecoveryMetricsDto;

  @ValidateNested()
  @Type(() => PerformanceMetricsDto)
  performance!: PerformanceMetricsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileCandidateDto)
  profileCandidates!: ProfileCandidateDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionDto)
  sessions!: SessionDto[];
}

export class FetchResultDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => GarminSessionDto)
  session?: GarminSessionDto | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FetchedDayDto)
  days!: FetchedDayDto[];
}
