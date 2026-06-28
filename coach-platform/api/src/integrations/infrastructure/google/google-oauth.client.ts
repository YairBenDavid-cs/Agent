import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleAccessToken,
  GoogleOAuthClient,
  GoogleOAuthTokens,
} from '../../domain/google-oauth';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

interface GoogleTokenResponse {
  refresh_token?: string;
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Google OAuth2 authorization-code flow implemented directly against Google's
 * REST endpoints (no googleapis SDK dependency). We only need to (1) build the
 * consent URL and (2) trade the returned code for a refresh token, so a couple
 * of `fetch` calls keep the dependency surface small.
 */
@Injectable()
export class GoogleApiOAuthClient extends GoogleOAuthClient {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private get clientId(): string {
    return this.config.get<string>('googleOauthClientId') ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('googleOauthClientSecret') ?? '';
  }

  private get redirectUri(): string {
    return this.config.get<string>('googleOauthRedirectUri') ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      // offline + forced consent guarantees Google returns a refresh token,
      // even on a repeat authorization for the same account.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleOAuthTokens> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokens = (await response.json()) as GoogleTokenResponse;
    if (!response.ok) {
      throw new Error(
        tokens.error_description ?? tokens.error ?? 'Google token exchange failed.',
      );
    }

    return {
      refreshToken: tokens.refresh_token ?? '',
      email: this.emailFromIdToken(tokens.id_token),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleAccessToken> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const tokens = (await response.json()) as GoogleTokenResponse;
    if (!response.ok || !tokens.access_token) {
      throw new Error(
        tokens.error_description ??
          tokens.error ??
          'Google access-token refresh failed.',
      );
    }
    return {
      accessToken: tokens.access_token,
      expiresInSec: tokens.expires_in ?? 3600,
    };
  }

  /** Pull the verified email out of the id_token. The token came straight from
   * Google's token endpoint over TLS, so decoding the payload is sufficient. */
  private emailFromIdToken(idToken: string | undefined): string | null {
    if (!idToken) {
      return null;
    }
    const payload = idToken.split('.')[1];
    if (!payload) {
      return null;
    }
    try {
      const json = Buffer.from(payload, 'base64').toString('utf8');
      const claims = JSON.parse(json) as { email?: string };
      return claims.email ?? null;
    } catch {
      return null;
    }
  }
}
