// Pure, per-step validators that gate the wizard's "Next"/"Finish" button.
// They mirror the constraints the NestJS DTOs enforce, so a valid wizard maps
// to a payload the server will accept.
import type { OnboardingDraft } from '../state/onboardingDraft';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return HHMM.test(value);
}

/** Slot is well-formed and the window is non-empty (start strictly before end). */
export function isValidSlot(startTime: string, endTime: string): boolean {
  return isValidTime(startTime) && isValidTime(endTime) && startTime < endTime;
}

/** A real calendar date, not in the future, and not absurdly old. */
export function isValidDateOfBirth(value: string): boolean {
  if (value === '') {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  const earliest = new Date('1900-01-01');
  return date <= now && date >= earliest;
}

/** Optional positive-integer field: empty is allowed, otherwise must be >= 1. */
export function isOptionalPositiveInt(value: string): boolean {
  if (value.trim() === '') {
    return true;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= 1;
}

/** Required integer field within an inclusive range. */
export function isIntInRange(value: string, min: number, max: number): boolean {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
}

export function isDisciplineStepValid(draft: OnboardingDraft): boolean {
  return draft.discipline !== null;
}

export function isGoalStepValid(draft: OnboardingDraft): boolean {
  return draft.goal.primaryGoal !== null && draft.goal.note.length <= 500;
}

export function isProfileStepValid(draft: OnboardingDraft): boolean {
  return (
    draft.profile.sex !== null &&
    isValidDateOfBirth(draft.profile.dateOfBirth) &&
    isOptionalPositiveInt(draft.profile.heightCm) &&
    isOptionalPositiveInt(draft.profile.weightKg)
  );
}

export function isAvailabilityStepValid(draft: OnboardingDraft): boolean {
  return (
    draft.availability.length >= 1 &&
    draft.availability.length <= 21 &&
    draft.availability.every((s) => isValidSlot(s.startTime, s.endTime)) &&
    draft.sessionDurationMin >= 10 &&
    draft.sessionDurationMin <= 300
  );
}

export function isPrefsStepValid(draft: OnboardingDraft): boolean {
  if (draft.discipline === 'running') {
    const n = Number(draft.run.weeklyKm);
    return (
      draft.run.weeklyKm.trim() !== '' &&
      Number.isFinite(n) &&
      n >= 0 &&
      draft.run.likedRunTypes.length >= 1 &&
      isOptionalPositiveInt(draft.run.longestRecentKm)
    );
  }
  if (draft.discipline === 'strength') {
    return (
      draft.strength.targetMuscleGroups.length >= 1 &&
      draft.strength.equipment.length >= 1 &&
      isIntInRange(draft.strength.exercisesPerSession, 1, 50) &&
      isIntInRange(draft.strength.setsPerExercise, 1, 20) &&
      isIntInRange(draft.strength.repsPerExercise, 1, 100)
    );
  }
  return false;
}
