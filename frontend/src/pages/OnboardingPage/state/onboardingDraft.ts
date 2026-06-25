// The wizard's working state. Numeric inputs are held as strings so the user
// can clear/type freely; they're parsed only when building the API payload.
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
}

export const initialDraft: OnboardingDraft = {
  discipline: null,
  goal: { primaryGoal: null, note: '' },
  profile: { sex: null, dateOfBirth: '', heightCm: '', weightKg: '' },
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
};

export type OnboardingAction =
  | { type: 'setDiscipline'; value: Discipline }
  | { type: 'patchGoal'; patch: Partial<GoalDraft> }
  | { type: 'patchProfile'; patch: Partial<ProfileDraft> }
  | { type: 'setAvailability'; value: AvailabilitySlot[] }
  | { type: 'setSessionDuration'; value: number }
  | { type: 'patchRun'; patch: Partial<RunDraft> }
  | { type: 'patchStrength'; patch: Partial<StrengthDraft> };

export function onboardingReducer(
  state: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'setDiscipline':
      return { ...state, discipline: action.value };
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
    default:
      return state;
  }
}
