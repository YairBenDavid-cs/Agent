import {
  Discipline,
  GoalSnapshot,
  ProgramStatus,
  ProgramWeek,
} from '../../domain/program.model';

/** Outward shape of a program. Exposes `id` (needed to fetch weeks) but no
 * internal persistence fields (user_id, _v). */
export class ProgramResponse {
  id!: string;
  discipline!: Discipline;
  goalSnapshot!: GoalSnapshot;
  startDate!: string;
  horizonDate!: string;
  status!: ProgramStatus;
  currentWeekIndex!: number;
  weeks!: ProgramWeek[];
}

/** Envelope for "does the caller have an active program yet?" */
export class ActiveProgramResponse {
  hasProgram!: boolean;
  program!: ProgramResponse | null;
}
