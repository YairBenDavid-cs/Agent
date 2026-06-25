import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  Matches,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Sex } from '../../../users/domain/user.model';

/**
 * Validates that a string is a recognised IANA time zone (e.g. "Asia/Jerusalem").
 * Defers to the runtime's own tz database via Intl: an unknown zone makes the
 * DateTimeFormat constructor throw, which we treat as invalid.
 */
function IsIanaTimeZone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.trim() === '') {
            return false;
          }
          try {
            Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid IANA time zone (e.g. "Europe/London").`;
        },
      },
    });
  };
}

/**
 * Profile fields collected during onboarding that belong on the `users` record,
 * not the training profile. Age is captured as date_of_birth (age stays derived,
 * never frozen). Height/weight are optional. Country (ISO 3166-1 alpha-2) and the
 * IANA timezone drive locale-aware scheduling. The submit handler patches these
 * onto `users` in the same transaction as the training profile insert.
 */
export class OnboardingProfileDto {
  @IsIn(['male', 'female', 'other'])
  sex!: Sex;

  @IsISO8601({ strict: true })
  dateOfBirth!: string;

  @Matches(/^[A-Z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code (e.g. "GB").' })
  country!: string;

  @IsIanaTimeZone()
  timezone!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  weightKg?: number;
}
