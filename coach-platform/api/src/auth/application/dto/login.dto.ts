import { IsEmail, IsString } from 'class-validator';

/** Login body. No length rule on password — we never hint at the policy here. */
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
