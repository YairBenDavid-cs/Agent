import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Sex, Units } from '../../domain/user.model';

/**
 * Create body. Server-generated fields (userId, timestamps) are never here.
 * Only email + name are required at signup; profile details are optional and
 * collected later during onboarding.
 */
export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() name!: string;

  @IsOptional() @IsISO8601({ strict: true }) dateOfBirth?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) sex?: Sex;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsIn(['metric', 'imperial']) units?: Units;
  @IsOptional() @IsInt() @Min(1) heightCm?: number;
  @IsOptional() @IsInt() @Min(1) weightKg?: number;
}
