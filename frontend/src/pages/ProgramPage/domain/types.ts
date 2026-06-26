// Frontend mirror of the program / planned-session API contracts. Kept narrow:
// only the fields the calendar + card views actually render.

export type Discipline = 'running' | 'strength';
export type PlanState = 'committed' | 'tentative';
export type PlannedStatus =
  | 'planned'
  | 'completed'
  | 'partially_completed'
  | 'skipped'
  | 'deviated';
export type WeekTheme = 'base' | 'build' | 'peak' | 'deload' | 'taper';
export type WeekStatus = 'upcoming' | 'current' | 'done';

export interface GoalSnapshot {
  primaryGoal: string;
  note: string | null;
  horizon: string;
}

export interface ProgramWeek {
  weekIndex: number;
  startDate: string;
  endDate: string;
  theme: WeekTheme;
  plannedLoadTarget: number | null;
  planState: PlanState;
  status: WeekStatus;
  generatedAt: string | null;
}

export interface Program {
  id: string;
  discipline: Discipline;
  goalSnapshot: GoalSnapshot;
  startDate: string;
  horizonDate: string;
  status: string;
  currentWeekIndex: number;
  weeks: ProgramWeek[];
}

export interface ActiveProgramResponse {
  hasProgram: boolean;
  program: Program | null;
}

export interface RunSegment {
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown';
  repeat: number;
  distanceM: number | null;
  durationSec: number | null;
  targetPace: string | null;
  targetHrZone: number | null;
  restSec: number | null;
}

export interface RunningPlan {
  runType: string;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  targetPace: string | null;
  targetHrZone: number | null;
  targetRpe: number | null;
  segments: RunSegment[];
}

export interface PlannedExercise {
  name: string;
  category: string;
  order: number;
  sets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetWeightKg: number | null;
  targetPct1rm: number | null;
  targetRir: number | null;
  restSec: number | null;
  tempo: string | null;
  supersetGroup: string | null;
}

export interface StrengthPlan {
  splitFocus: string | null;
  exercises: PlannedExercise[];
  targetVolumeLoad: number | null;
}

export interface PlannedOutcome {
  status: PlannedStatus;
  reasonCode: string | null;
  perceivedEffort: number | null;
  enjoyment: number | null;
  matchedActivityId: number | null;
  feedbackRef: string | null;
  recordedAt: string | null;
}

export interface PlannedSession {
  id: string;
  programId: string;
  weekIndex: number;
  type: Discipline;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  scheduledStartUtc: string;
  planState: PlanState;
  title: string;
  estDurationMin: number;
  intensityLabel: string;
  coachNotes: string | null;
  running: RunningPlan | null;
  strength: StrengthPlan | null;
  outcome: PlannedOutcome;
}
