import { IsString, MinLength } from 'class-validator';

/** Garmin sign-in credentials. Captured once, encrypted at rest, never returned. */
export class ConnectGarminDto {
  @IsString() @MinLength(1) email!: string;
  @IsString() @MinLength(1) password!: string;
}

/**
 * Completes a 2FA login. `loginId` identifies the pending login the fetch service
 * is holding; `code` is the value Garmin sent the user. Email/password are resent
 * so we can persist the credentials only once the connection truly succeeds (we
 * deliberately store nothing while a login is still pending its 2FA code).
 */
export class VerifyGarminMfaDto {
  @IsString() @MinLength(1) loginId!: string;
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) email!: string;
  @IsString() @MinLength(1) password!: string;
}

/**
 * Google Calendar OAuth — the authorization code returned by Google's consent
 * screen. The server exchanges it for a refresh token; we never take a password.
 */
export class ConnectGoogleCalendarDto {
  @IsString() @MinLength(1) code!: string;
}

export class ConnectTelegramDto {
  @IsString() @MinLength(1) chatId!: string;
  @IsString() @MinLength(1) botToken!: string;
}
