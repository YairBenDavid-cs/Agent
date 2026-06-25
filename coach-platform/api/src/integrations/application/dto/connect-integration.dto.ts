import { IsString, MinLength } from 'class-validator';

/** Garmin sign-in credentials. Captured once, encrypted at rest, never returned. */
export class ConnectGarminDto {
  @IsString() @MinLength(1) email!: string;
  @IsString() @MinLength(1) password!: string;
}

/** Google Calendar OAuth — refresh token only; we never take a password. */
export class ConnectGoogleCalendarDto {
  @IsString() @MinLength(1) refreshToken!: string;
}

export class ConnectTelegramDto {
  @IsString() @MinLength(1) chatId!: string;
  @IsString() @MinLength(1) botToken!: string;
}
