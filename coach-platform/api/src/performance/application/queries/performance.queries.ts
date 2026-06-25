export class GetPerformanceRangeQuery {
  constructor(
    public readonly userId: string,
    public readonly from: string,
    public readonly to: string,
    public readonly cursor: string | null,
    public readonly limit: number,
  ) {}
}

export class GetCurrentProfileQuery {
  constructor(public readonly userId: string) {}
}

export class GetMetricHistoryQuery {
  constructor(
    public readonly userId: string,
    public readonly metric: string,
  ) {}
}
