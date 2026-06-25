import { IsISO8601, IsOptional } from 'class-validator';

/** Optional explicit window; omit both to use the configured backfill window. */
export class TriggerIngestionDto {
  @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @IsOptional() @IsISO8601({ strict: true }) to?: string;
}
