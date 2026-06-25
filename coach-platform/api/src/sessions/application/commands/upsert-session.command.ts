import {
  RunningDetail,
  SessionType,
  StrengthDetail,
} from '../../domain/workout-session.model';

export interface UpsertResult {
  written: boolean;
}

export class UpsertSessionCommand {
  constructor(
    public readonly userId: string,
    public readonly activityId: number,
    public readonly date: string,
    public readonly type: SessionType,
    public readonly subtype: string | null,
    public readonly source: string,
    public readonly running: RunningDetail | null,
    public readonly strength: StrengthDetail | null,
  ) {}
}
