import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CryptoService } from '../../common/crypto/crypto.service';
import {
  GARMIN_AUTH_CLIENT,
  GarminAuthClientPort,
} from '../domain/garmin-auth.port';
import { GoogleOAuthClient } from '../domain/google-oauth';
import {
  GARMIN_CONNECTED,
  GarminConnectedEvent,
} from './events/garmin-connected.event';
import { GarminConnectResponse } from './dto/garmin-connect.response';
import {
  GarminAuth,
  GoogleCalendarAuth,
  GarminSession,
  IntegrationStatus,
  TelegramAuth,
} from '../domain/integration.model';
import { UserIntegrationsRecord } from '../domain/integrations.record';
import {
  INTEGRATIONS_REPOSITORY,
  IntegrationsRepositoryPort,
} from '../domain/integrations.repository.port';
import {
  ConnectGarminDto,
  ConnectGoogleCalendarDto,
  ConnectTelegramDto,
  VerifyGarminMfaDto,
} from './dto/connect-integration.dto';

/**
 * The integrations capability, exposed to other bounded contexts (notably the
 * ingestion orchestrator) as a plain provider rather than via the CQRS buses.
 *
 * Rationale for the deliberate deviation from the command/query convention:
 * this is a cross-context capability whose whole job is custody of secrets.
 * Encryption happens HERE on write and decryption HERE on read; the repository
 * only ever touches ciphertext, and decrypted `*Auth` values are returned only
 * to trusted server-side callers — never through a controller.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(INTEGRATIONS_REPOSITORY)
    private readonly repository: IntegrationsRepositoryPort,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthClient,
    private readonly events: EventEmitter2,
    @Inject(GARMIN_AUTH_CLIENT)
    private readonly garminAuth: GarminAuthClientPort,
  ) {}

  private now(): string {
    return new Date().toISOString();
  }

  // --- write side (called by controller) ------------------------------------

  /**
   * Authenticate to Garmin synchronously so the user gets real feedback:
   *  - bad credentials -> 401 (re-enter and retry);
   *  - 2FA challenge -> return the loginId so the caller can submit the code;
   *  - success -> persist credentials + the minted session and kick off the
   *    background backfill.
   *
   * On a 2FA challenge we deliberately store NOTHING yet, so the user's
   * connection status stays truthfully "disconnected" until the code is verified.
   */
  async connectGarmin(
    userId: string,
    dto: ConnectGarminDto,
  ): Promise<GarminConnectResponse> {
    const result = await this.garminAuth.authenticate(dto.email, dto.password);
    if (result.status === 'invalid_credentials') {
      throw new UnauthorizedException({
        code: 'GARMIN_INVALID_CREDENTIALS',
        message: 'Invalid Garmin email or password. Please try again.',
      });
    }
    if (result.status === 'mfa_required') {
      return { status: 'mfa_required', loginId: result.loginId };
    }
    await this.persistGarmin(userId, dto.email, dto.password, result.session);
    return { status: 'connected' };
  }

  /**
   * Complete a 2FA login with the code the user received, then persist
   * credentials + session and kick off the background backfill.
   */
  async verifyGarminMfa(
    userId: string,
    dto: VerifyGarminMfaDto,
  ): Promise<GarminConnectResponse> {
    const result = await this.garminAuth.completeMfa(dto.loginId, dto.code);
    if (result.status === 'expired') {
      throw new GoneException({
        code: 'GARMIN_MFA_EXPIRED',
        message: 'Your verification window expired. Please connect again.',
      });
    }
    if (result.status === 'invalid_code') {
      throw new UnauthorizedException({
        code: 'GARMIN_INVALID_MFA_CODE',
        message: 'That verification code was not accepted. Please try again.',
      });
    }
    await this.persistGarmin(userId, dto.email, dto.password, result.session);
    return { status: 'connected' };
  }

  /**
   * Store the (encrypted) credentials together with the freshly minted session,
   * then fire-and-forget the first backfill. The ingestion listener isolates and
   * logs its own failures, so a slow backfill never blocks the connect response.
   */
  private async persistGarmin(
    userId: string,
    email: string,
    password: string,
    session: GarminSession | null,
  ): Promise<void> {
    if (!session?.token) {
      throw new ServiceUnavailableException(
        'Connected to Garmin, but could not establish a session. Please try again in a moment.',
      );
    }
    await this.repository.upsertGarmin(userId, {
      email,
      passwordEnc: this.crypto.encrypt(password),
      sessionEnc: this.crypto.encrypt(session.token),
      sessionExpiresAt: session.expiresAt,
      updatedAt: this.now(),
    });
    this.events.emit(GARMIN_CONNECTED, new GarminConnectedEvent(userId));
  }

  /** Build the Google consent URL. Sent to the browser to start the OAuth flow. */
  getGoogleCalendarAuthUrl(): { url: string } {
    if (!this.googleOAuth.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message: 'Google Calendar connection is not configured on the server.',
      });
    }
    return { url: this.googleOAuth.buildAuthUrl() };
  }

  /**
   * Exchange the OAuth authorization code for a refresh token, encrypt it, and
   * persist it. Without a refresh token we cannot mint access tokens later, so
   * its absence is a hard failure (the user must re-consent).
   */
  async connectGoogleCalendar(
    userId: string,
    dto: ConnectGoogleCalendarDto,
  ): Promise<void> {
    if (!this.googleOAuth.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message: 'Google Calendar connection is not configured on the server.',
      });
    }
    const tokens = await this.googleOAuth.exchangeCode(dto.code);
    if (!tokens.refreshToken) {
      throw new BadRequestException({
        code: 'GOOGLE_NO_REFRESH_TOKEN',
        message:
          'Google did not return a refresh token. Disconnect the app from your Google account and try again.',
      });
    }
    await this.repository.upsertGoogleCalendar(userId, {
      refreshTokenEnc: this.crypto.encrypt(tokens.refreshToken),
      updatedAt: this.now(),
    });
  }

  async connectTelegram(userId: string, dto: ConnectTelegramDto): Promise<void> {
    await this.repository.upsertTelegram(userId, {
      chatId: dto.chatId,
      botTokenEnc: this.crypto.encrypt(dto.botToken),
      updatedAt: this.now(),
    });
  }

  /** Persist a freshly minted Garmin session (called after the fetch service
   * authenticates) so subsequent fetches reuse it instead of logging in again. */
  async saveGarminSession(
    userId: string,
    session: GarminSession,
  ): Promise<void> {
    await this.repository.updateGarminSession(
      userId,
      this.crypto.encrypt(session.token),
      session.expiresAt,
    );
  }

  // --- read side: safe status (exposed via API) -----------------------------

  async getStatuses(userId: string): Promise<IntegrationStatus[]> {
    const record = await this.repository.find(userId);
    return [
      this.status('garmin', record?.garmin?.updatedAt ?? null),
      this.status(
        'google_calendar',
        record?.googleCalendar?.updatedAt ?? null,
      ),
      this.status('telegram', record?.telegram?.updatedAt ?? null),
    ];
  }

  private status(
    provider: IntegrationStatus['provider'],
    updatedAt: string | null,
  ): IntegrationStatus {
    return { provider, connected: updatedAt !== null, updatedAt };
  }

  // --- read side: DECRYPTED secrets (server-side trusted callers only) -------

  async getDecryptedGarminAuth(userId: string): Promise<GarminAuth> {
    const record = await this.requireRecord(userId);
    if (!record.garmin) {
      throw new NotFoundException('Garmin is not connected for this user.');
    }
    const g = record.garmin;
    return {
      credentials: {
        email: g.email,
        password: this.crypto.decrypt(g.passwordEnc),
      },
      session:
        g.sessionEnc && g.sessionExpiresAt
          ? {
              token: this.crypto.decrypt(g.sessionEnc),
              expiresAt: g.sessionExpiresAt,
            }
          : null,
    };
  }

  async getDecryptedGoogleCalendarAuth(
    userId: string,
  ): Promise<GoogleCalendarAuth> {
    const record = await this.requireRecord(userId);
    if (!record.googleCalendar) {
      throw new NotFoundException(
        'Google Calendar is not connected for this user.',
      );
    }
    return {
      refreshToken: this.crypto.decrypt(record.googleCalendar.refreshTokenEnc),
    };
  }

  async getDecryptedTelegramAuth(userId: string): Promise<TelegramAuth> {
    const record = await this.requireRecord(userId);
    if (!record.telegram) {
      throw new NotFoundException('Telegram is not connected for this user.');
    }
    return {
      chatId: record.telegram.chatId,
      botToken: this.crypto.decrypt(record.telegram.botTokenEnc),
    };
  }

  private async requireRecord(
    userId: string,
  ): Promise<UserIntegrationsRecord> {
    const record = await this.repository.find(userId);
    if (!record) {
      throw new NotFoundException('No integrations configured for this user.');
    }
    return record;
  }
}
