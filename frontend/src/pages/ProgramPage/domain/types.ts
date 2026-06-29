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
export type WeekTheme = 'assessment' | 'base' | 'build' | 'peak' | 'deload' | 'taper';
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

// Section semantics — drives the label + colour of a block header.
export type SegmentKind = 'warmup' | 'work' | 'recovery' | 'cooldown';

// 'run' -> RUN badge, 'rest' -> REST badge.
export type StepType = 'run' | 'rest';

// One row inside a block — a single run or rest interval. `targetPace` is a free
// string: a concrete value ("4:30/km") or a qualitative cue ("conversational").
export interface RunStep {
  type: StepType;
  distanceM: number | null; // exactly one of distanceM / durationSec is set
  durationSec: number | null;
  targetPace: string | null;
  targetHrZone: number | null; // 1–5
  note: string | null; // secondary cue line, e.g. "No faster than 5:15/km"
}

// An ordered section of a run. `repeat > 1` renders the "Repeat ×{repeat}"
// header that wraps its steps; `label` overrides the title (falls back to kind).
export interface RunBlock {
  kind: SegmentKind;
  label: string | null;
  repeat: number; // 1 = single pass
  steps: RunStep[]; // min 1
}

export interface RunningPlan {
  runType: string;
  totalDistanceKm: number | null;
  totalDurationMin: number | null;
  targetPace: string | null;
  targetHrZone: number | null;
  targetRpe: number | null;
  blocks: RunBlock[];
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
