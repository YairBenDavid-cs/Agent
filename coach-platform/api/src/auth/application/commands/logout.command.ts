/** Revoke the current session. The refresh token may be absent/invalid. */
export class LogoutCommand {
  constructor(public readonly refreshToken?: string) {}
}
