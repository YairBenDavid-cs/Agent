import { Sex } from '../../domain/user.model';

/**
 * Fields that onboarding is allowed to patch onto an existing user. Deliberately
 * narrow — it cannot touch email, role, status, etc. `undefined` means "leave
 * as-is"; `null` explicitly clears an optional field.
 */
export interface UserProfilePatch {
  sex?: Sex;
  dateOfBirth?: string;
  country?: string;
  timezone?: string;
  heightCm?: number | null;
  weightKg?: number | null;
}

export class UpdateUserProfileCommand {
  constructor(
    public readonly userId: string,
    public readonly patch: UserProfilePatch,
  ) {}
}
