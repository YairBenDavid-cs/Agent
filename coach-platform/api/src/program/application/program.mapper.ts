import { Program } from '../domain/program.model';
import { ProgramResponse } from './dto/program.response';

export const toProgramResponse = (program: Program): ProgramResponse => ({
  id: program.id ?? '',
  discipline: program.discipline,
  goalSnapshot: program.goalSnapshot,
  startDate: program.startDate,
  horizonDate: program.horizonDate,
  status: program.status,
  currentWeekIndex: program.currentWeekIndex,
  weeks: program.weeks,
});
