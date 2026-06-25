import { IsString, MinLength } from 'class-validator';
import { CreateUserDto } from '../../../users/application/dto/create-user.dto';

/**
 * Registration = a full user profile plus a password. Extending CreateUserDto
 * keeps the profile validation rules in one place; only the password is new.
 */
export class RegisterDto extends CreateUserDto {
  @IsString() @MinLength(8) password!: string;
}
