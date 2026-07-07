// Pure, per-step validators that gate the wizard's "Next"/"Finish" button.
// They mirror the constraints the NestJS DTOs enforce, so a valid wizard maps
// to a payload the server will accept.
import type { OnboardingDraft } from '../state/onboardingDraft';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "m:ss" / "mm:ss" / "h:mm:ss" — mirrors the server's RunPrefsDto regex. */
const RACE_TIME = /^(\d{1,2}:)?[0-5]?\d:[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return HHMM.test(value);
}

/** Optional 5k time: empty is allowed, otherwise must be a plausible mm:ss. */
export function isOptional5kTime(value: string): boolean {
  return value.trim() === '' || RACE_TIME.test(value.trim());
}

/** Optional non-negative number with an inclusive upper bound. Empty allowed. */
export function isOptionalNumberInRange(value: string, max: number): boolean {
  if (value.trim() === '') {
    return true;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max;
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

/**
 * Comma-separated favourite exercises, mirroring the server's StrengthPrefsDto:
 * at most 50 entries, each at most 80 chars. Empty is allowed (optional field).
 */
export function preferredExercisesValid(raw: string): boolean {
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  return items.length <= 50 && items.every((item) => item.length <= 80);
}

export function isDisciplineStepValid(draft: OnboardingDraft): boolean {
  return draft.discipline !== null;
}

export function isGoalStepValid(draft: OnboardingDraft): boolean {
  return draft.goal.primaryGoal !== null && draft.goal.note.length <= 500;
}

const ISO_ALPHA2 = /^[A-Z]{2}$/;

/** Sex + a real date of birth. First of the three profile steps. */
export function isBasicsStepValid(draft: OnboardingDraft): boolean {
  return draft.profile.sex !== null && isValidDateOfBirth(draft.profile.dateOfBirth);
}

/** A valid country code and a non-empty (auto-detected) time zone. */
export function isLocationStepValid(draft: OnboardingDraft): boolean {
  return ISO_ALPHA2.test(draft.profile.country) && draft.profile.timezone.trim() !== '';
}

/** Height/weight are optional; steppers keep them in range, so this is lenient. */
export function isBodyStepValid(draft: OnboardingDraft): boolean {
  return (
    isOptionalPositiveInt(draft.profile.heightCm) &&
    isOptionalPositiveInt(draft.profile.weightKg)
  );
}

/** The full profile — kept for callers that gate on all profile fields at once. */
export function isProfileStepValid(draft: OnboardingDraft): boolean {
  return isBasicsStepValid(draft) && isLocationStepValid(draft) && isBodyStepValid(draft);
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

/** Both external accounts must be linked before onboarding can finish. */
export function isConnectStepValid(draft: OnboardingDraft): boolean {
  return draft.connections.garminConnected && draft.connections.googleConnected;
}

export function isPrefsStepValid(draft: OnboardingDraft): boolean {
  if (draft.discipline === 'running') {
    const n = Number(draft.run.weeklyKm);
    return (
      draft.run.weeklyKm.trim() !== '' &&
      Number.isFinite(n) &&
      n >= 0 &&
      n <= 300 &&
      draft.run.likedRunTypes.length >= 1 &&
      isOptionalNumberInRange(draft.run.longestRecentKm, 500) &&
      draft.run.targetRace.length <= 120 &&
      isOptional5kTime(draft.run.recent5kTime)
    );
  }
  if (draft.discipline === 'strength') {
    return (
      draft.strength.targetMuscleGroups.length >= 1 &&
      draft.strength.equipment.length >= 1 &&
      isIntInRange(draft.strength.exercisesPerSession, 1, 50) &&
      isIntInRange(draft.strength.setsPerExercise, 1, 20) &&
      isIntInRange(draft.strength.repsPerExercise, 1, 100) &&
      preferredExercisesValid(draft.strength.preferredExercises)
    );
  }
  return false;
}
