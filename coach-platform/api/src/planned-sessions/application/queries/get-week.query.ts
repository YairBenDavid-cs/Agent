/** Fetch all planned trains for one program week, in scheduled order. */
export class GetWeekQuery {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weekIndex: number,
  ) {}
}
