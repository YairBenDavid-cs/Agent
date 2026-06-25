import { IsISO8601, IsOptional } from 'class-validator';

/** Common query for reading a daily time-series over a closed date range. */
export class DateRangeQuery {
  @IsISO8601({ strict: true })
  from!: string; // inclusive, YYYY-MM-DD

  @IsISO8601({ strict: true })
  to!: string; // inclusive, YYYY-MM-DD

  @IsOptional()
  @IsISO8601({ strict: true })
  cursor?: string; // opaque date cursor for pagination (exclusive)
}

/** Forward-compatible collection envelope. */
export interface CollectionEnvelope<T> {
  items: T[];
  nextCursor: string | null;
}
