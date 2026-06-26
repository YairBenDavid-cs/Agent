/** Fetch the caller's planned trains over a closed local date range (calendar). */
export class GetCalendarRangeQuery {
  constructor(
    public readonly userId: string,
    public readonly from: string, // YYYY-MM-DD inclusive
    public readonly to: string, // YYYY-MM-DD inclusive
  ) {}
}
