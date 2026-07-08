import { IsBoolean } from 'class-validator';

/** Self-service settings toggle body — deliberately narrower than onboarding's UserProfilePatch. */
export class UpdateUserSettingsDto {
  @IsBoolean() autoModeOptIn!: boolean;
}
