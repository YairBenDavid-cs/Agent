export class GetRecoveryRangeQuery {
  constructor(
    public readonly userId: string,
    public readonly from: string,
    public readonly to: string,
    public readonly cursor: string | null,
    public readonly limit: number,
  ) {}
}
