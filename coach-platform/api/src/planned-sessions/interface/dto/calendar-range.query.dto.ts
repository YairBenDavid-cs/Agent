import { IsISO8601 } from 'class-validator';

/** Query params for the calendar/card range fetch. */
export class CalendarRangeQueryDto {
  @IsISO8601({ strict: true }) from!: string; // YYYY-MM-DD inclusive

  @IsISO8601({ strict: true }) to!: string; // YYYY-MM-DD inclusive
}
