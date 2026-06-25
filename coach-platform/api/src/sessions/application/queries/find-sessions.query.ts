import { SessionType } from '../../domain/workout-session.model';

export class FindSessionsQuery {
  constructor(
    public readonly userId: string,
    public readonly from: string,
    public readonly to: string,
    public readonly type: SessionType | null,
    public readonly cursor: number | null,
    public readonly limit: number,
  ) {}
}
