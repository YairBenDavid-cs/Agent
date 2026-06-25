/** Rotate a refresh token. Carries the raw token read from the cookie. */
export class RefreshCommand {
  constructor(public readonly refreshToken: string) {}
}
