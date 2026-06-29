// The wizard's working state. Numeric inputs are held as strings so the user
// can clear/type freely; they're parsed only when building the API payload.
import { isGoalInDiscipline } from '../domain/goals';
import { detectTimeZone } from '../domain/timezone';
import type {
  AvailabilitySlot,
  Discipline,
  Equipment,
  ExperienceLevel,
  MuscleGroup,
  PrimaryGoal,
  RunType,
  Sex,
  SplitPreference,
} from '../domain/types';

export interface GoalDraft {
  primaryGoal: PrimaryGoal | null;
  note: string;
}

export interface ProfileDraft {
  sex: Sex | null;
  dateOfBirth: string;
  country: string; // ISO 3166-1 alpha-2; '' until the user picks one
  timezone: string; // IANA; auto-detected from the browser at draft creation
  heightCm: string;
  weightKg: string;
}

export interface RunDraft {
  weeklyKm: string;
  likedRunTypes: RunType[];
  experienceLevel: ExperienceLevel | '';
  longestRecentKm: string;
  targetRace: string;
  recent5kTime: string;
}

export interface StrengthDraft {
  targetMuscleGroups: MuscleGroup[];
  exercisesPerSession: string;
  setsPerExercise: string;
  repsPerExercise: string;
  equipment: Equipment[];
  preferredExercises: string;
  experienceLevel: ExperienceLevel | '';
  splitPreference: SplitPreference | '';
}

export interface OnboardingDraft {
  discipline: Discipline | null;
  goal: GoalDraft;
  profile: ProfileDraft;
  availability: AvailabilitySlot[];
  sessionDurationMin: number;
  run: RunDraft;
  strength: StrengthDraft;
  connections: ConnectionsDraft;
}

/** Which external accounts the user has linked. Mirrors the server's
 * /integrations status; the connect step keeps it in sync so the wizard can
 * gate "Finish" on both providers being connected. */
export interface ConnectionsDraft {
  garminConnected: boolean;
  googleConnected: boolean;
}

export const initialDraft: OnboardingDraft = {
  discipline: null,
  goal: { primaryGoal: null, note: '' },
  profile: {
    sex: null,
    dateOfBirth: '',
    country: '',
    // Resolved once from the browser so the field is populated from first render.
    timezone: detectTimeZone(),
    heightCm: '',
    weightKg: '',
  },
  availability: [{ day: 'mon', startTime: '07:00', endTime: '08:00' }],
  sessionDurationMin: 60,
  run: {
    weeklyKm: '',
    likedRunTypes: [],
    experienceLevel: '',
    longestRecentKm: '',
    targetRace: '',
    recent5kTime: '',
  },
  strength: {
    targetMuscleGroups: [],
    exercisesPerSession: '5',
    setsPerExercise: '3',
    repsPerExercise: '10',
    equipment: [],
    preferredExercises: '',
    experienceLevel: '',
    splitPreference: '',
  },
  connections: { garminConnected: false, googleConnected: false },
};

export type OnboardingAction =
  | { type: 'setDiscipline'; value: Discipline }
  | { type: 'patchGoal'; patch: Partial<GoalDraft> }
  | { type: 'patchProfile'; patch: Partial<ProfileDraft> }
  | { type: 'setAvailability'; value: AvailabilitySlot[] }
  | { type: 'setSessionDuration'; value: number }
  | { type: 'patchRun'; patch: Partial<RunDraft> }
  | { type: 'patchStrength'; patch: Partial<StrengthDraft> }
  | { type: 'setConnections'; patch: Partial<ConnectionsDraft> };

export function onboardingReducer(
  state: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'setDiscipline': {
      // Goals are branched by discipline, so a goal picked under the old
      // discipline may not exist in the new branch — clear it if so. The
      // free-text note is discipline-agnostic and kept.
      const goal =
        state.goal.primaryGoal !== null &&
        !isGoalInDiscipline(state.goal.primaryGoal, action.value)
          ? { ...state.goal, primaryGoal: null }
          : state.goal;
      return { ...state, discipline: action.value, goal };
    }
    case 'patchGoal':
      return { ...state, goal: { ...state.goal, ...action.patch } };
    case 'patchProfile':
      return { ...state, profile: { ...state.profile, ...action.patch } };
    case 'setAvailability':
      return { ...state, availability: action.value };
    case 'setSessionDuration':
      return { ...state, sessionDurationMin: action.value };
    case 'patchRun':
      return { ...state, run: { ...state.run, ...action.patch } };
    case 'patchStrength':
      return { ...state, strength: { ...state.strength, ...action.patch } };
    case 'setConnections':
      return {
        ...state,
        connections: { ...state.connections, ...action.patch },
      };
    default:
      return state;
  }
}
