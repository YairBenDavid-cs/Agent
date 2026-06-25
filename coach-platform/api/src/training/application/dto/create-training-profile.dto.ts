import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Max,
  Min,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Discipline } from '../../domain/training-profile.model';
import { AvailabilitySlotDto } from './availability-slot.dto';
import { GoalDto } from './goal.dto';
import { OnboardingProfileDto } from './onboarding-profile.dto';
import { RunPrefsDto } from './run-prefs.dto';
import { StrengthPrefsDto } from './strength-prefs.dto';

/**
 * Cross-field invariant: exactly the block matching `discipline` is present, and
 * the other is absent. Attached to a property (not the class) because
 * class-validator only runs custom validators registered against a property —
 * `args.object` still gives access to the whole DTO. Enforced here so a malformed
 * payload is rejected by the global ValidationPipe (400) before any Mongo write.
 */
function DisciplineBlockConsistent(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'disciplineBlockConsistent',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(_: unknown, args: ValidationArguments): boolean {
          const dto = args.object as CreateTrainingProfileDto;
          if (dto.discipline === 'running') {
            return dto.run != null && dto.strength == null;
          }
          if (dto.discipline === 'strength') {
            return dto.strength != null && dto.run == null;
          }
          return false;
        },
        defaultMessage(args: ValidationArguments): string {
          const dto = args.object as CreateTrainingProfileDto;
          return `For discipline "${dto.discipline}", the matching preference block must be present and the other omitted.`;
        },
      },
    });
  };
}

/**
 * The full onboarding submission. One atomic POST: the discipline branch decides
 * which preference block is required, and `profile` carries the `users` patch.
 */
export class CreateTrainingProfileDto {
  @IsIn(['running', 'strength'])
  @DisciplineBlockConsistent()
  discipline!: Discipline;

  @IsObject()
  @ValidateNested()
  @Type(() => GoalDto)
  goal!: GoalDto;

  @IsObject()
  @ValidateNested()
  @Type(() => OnboardingProfileDto)
  profile!: OnboardingProfileDto;

  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  availability!: AvailabilitySlotDto[];

  @IsInt()
  @Min(10)
  @Max(300)
  sessionDurationMin!: number;

  // Exactly one of the two below is required, gated by `discipline` (see the
  // class-level validator). Both are optional at the field level so the
  // discriminator can decide.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RunPrefsDto)
  run?: RunPrefsDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StrengthPrefsDto)
  strength?: StrengthPrefsDto;
}
