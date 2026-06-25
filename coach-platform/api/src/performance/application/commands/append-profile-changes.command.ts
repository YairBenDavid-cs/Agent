import { ProfileMetricCandidate } from '../../domain/profile-change.model';

export interface AppendProfileResult {
  appended: number;
  skipped: number;
}

export class AppendProfileChangesCommand {
  constructor(
    public readonly userId: string,
    public readonly source: string,
    public readonly candidates: ProfileMetricCandidate[],
  ) {}
}
