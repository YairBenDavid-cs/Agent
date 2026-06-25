import { IsIn, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';
import { Sex } from '../../../users/domain/user.model';

/**
 * Profile fields collected during onboarding that belong on the `users` record,
 * not the training profile. Age is captured as date_of_birth (age stays derived,
 * never frozen). Height/weight are optional. The submit handler patches these
 * onto `users` in the same transaction as the training profile insert.
 */
export class OnboardingProfileDto {
  @IsIn(['male', 'female', 'other'])
  sex!: Sex;

  @IsISO8601({ strict: true })
  dateOfBirth!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  weightKg?: number;
}
