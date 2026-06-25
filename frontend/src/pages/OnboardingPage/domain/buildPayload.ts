// Maps the wizard draft to the exact /training-profile request body. Numeric
// strings are parsed, blank optionals are dropped (omitted entirely, never sent
// as undefined — the API runs under exactOptionalPropertyTypes), and only the
// preference block matching the chosen discipline is included.
import type { OnboardingDraft } from '../state/onboardingDraft';
import type {
  ExperienceLevel,
  OnboardingPayload,
  RunPrefsPayload,
  StrengthPrefsPayload,
} from './types';

function optionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function optionalLevel(value: ExperienceLevel | ''): ExperienceLevel | undefined {
  return value === '' ? undefined : value;
}

function buildRun(draft: OnboardingDraft['run']): RunPrefsPayload {
  const experienceLevel = optionalLevel(draft.experienceLevel);
  const longestRecentKm = optionalInt(draft.longestRecentKm);
  const targetRace = optionalText(draft.targetRace);
  const recent5kTime = optionalText(draft.recent5kTime);
  return {
    weeklyKm: Number(draft.weeklyKm),
    likedRunTypes: draft.likedRunTypes,
    ...(experienceLevel !== undefined && { experienceLevel }),
    ...(longestRecentKm !== undefined && { longestRecentKm }),
    ...(targetRace !== undefined && { targetRace }),
    ...(recent5kTime !== undefined && { recent5kTime }),
  };
}

function buildStrength(draft: OnboardingDraft['strength']): StrengthPrefsPayload {
  const preferred = draft.preferredExercises
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  const experienceLevel = optionalLevel(draft.experienceLevel);
  return {
    targetMuscleGroups: draft.targetMuscleGroups,
    exercisesPerSession: Number(draft.exercisesPerSession),
    setsPerExercise: Number(draft.setsPerExercise),
    repsPerExercise: Number(draft.repsPerExercise),
    equipment: draft.equipment,
    ...(preferred.length > 0 && { preferredExercises: preferred }),
    ...(experienceLevel !== undefined && { experienceLevel }),
    ...(draft.splitPreference !== '' && { splitPreference: draft.splitPreference }),
  };
}

/**
 * Assumes the draft has passed every step validator. `discipline`, `primaryGoal`
 * and `sex` are guaranteed non-null at this point; we assert to keep types tight.
 */
export function buildPayload(draft: OnboardingDraft): OnboardingPayload {
  if (draft.discipline === null || draft.goal.primaryGoal === null || draft.profile.sex === null) {
    throw new Error('buildPayload called on an incomplete draft');
  }

  const note = optionalText(draft.goal.note);
  const heightCm = optionalInt(draft.profile.heightCm);
  const weightKg = optionalInt(draft.profile.weightKg);

  return {
    discipline: draft.discipline,
    goal: {
      primaryGoal: draft.goal.primaryGoal,
      ...(note !== undefined && { note }),
    },
    profile: {
      sex: draft.profile.sex,
      dateOfBirth: draft.profile.dateOfBirth,
      ...(heightCm !== undefined && { heightCm }),
      ...(weightKg !== undefined && { weightKg }),
    },
    availability: draft.availability,
    sessionDurationMin: draft.sessionDurationMin,
    ...(draft.discipline === 'running'
      ? { run: buildRun(draft.run) }
      : { strength: buildStrength(draft.strength) }),
  };
}
