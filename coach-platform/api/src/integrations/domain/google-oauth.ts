/** Tokens obtained from Google's OAuth authorization-code exchange. */
export interface GoogleOAuthTokens {
  /** Long-lived refresh token. Absent if the user already consented before and
   * Google chose not to re-issue one (we force prompt=consent to avoid this). */
  refreshToken: string;
  /** The connected Google account's email, if the id_token carried it. */
  email: string | null;
}

/**
 * Port for the Google OAuth authorization-code flow used to connect a user's
 * Google Calendar. Knows nothing about persistence or encryption — the
 * implementation only talks to Google.
 */
export abstract class GoogleOAuthClient {
  /** Whether OAuth client credentials are configured (id/secret/redirect). */
  abstract isConfigured(): boolean;
  /** Consent URL to send the user to (offline access, calendar + email scopes). */
  abstract buildAuthUrl(): string;
  /** Exchange an authorization code for a refresh token (+ the account email). */
  abstract exchangeCode(code: string): Promise<GoogleOAuthTokens>;
}
