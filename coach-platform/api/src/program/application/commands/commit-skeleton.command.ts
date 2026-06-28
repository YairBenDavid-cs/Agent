import { ProgramWeek } from '../../domain/program.model';

/**
 * Replace a program's periodization skeleton (`weeks[]`) and current-week
 * pointer. The Coach's `commit_program_skeleton` terminal tool writes through
 * this — generation logic lives in the agent tier, never here.
 */
export class CommitSkeletonCommand {
  constructor(
    public readonly userId: string,
    public readonly programId: string,
    public readonly weeks: ProgramWeek[],
    public readonly currentWeekIndex: number,
  ) {}
}

export interface CommitSkeletonResult {
  committed: true;
  weekCount: number;
}
