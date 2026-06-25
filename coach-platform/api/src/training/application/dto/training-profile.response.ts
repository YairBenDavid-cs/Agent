import {
  AvailabilitySlot,
  Discipline,
  Goal,
  ProfileStatus,
  RunPrefs,
  StrengthPrefs,
} from '../../domain/training-profile.model';

/** Outward shape of a training profile. No internal fields (_id, user_id). */
export class TrainingProfileResponse {
  discipline!: Discipline;
  goal!: Goal;
  availability!: AvailabilitySlot[];
  sessionDurationMin!: number;
  run!: RunPrefs | null;
  strength!: StrengthPrefs | null;
  status!: ProfileStatus;
  completedAt!: string | null;
}

/**
 * Envelope for "does the caller need onboarding?" — lets the frontend route a
 * logged-in user into the wizard when `onboarded` is false.
 */
export class TrainingProfileStatusResponse {
  onboarded!: boolean;
  profile!: TrainingProfileResponse | null;
}
