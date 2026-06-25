import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CryptoService } from '../../common/crypto/crypto.service';
import { GoogleOAuthClient } from '../domain/google-oauth';
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
  ) {}

  private now(): string {
    return new Date().toISOString();
  }

  // --- write side (called by controller) ------------------------------------

  async connectGarmin(userId: string, dto: ConnectGarminDto): Promise<void> {
    await this.repository.upsertGarmin(userId, {
      email: dto.email,
      passwordEnc: this.crypto.encrypt(dto.password),
      // Re-connecting resets any cached session; it will be re-minted on next fetch.
      sessionEnc: null,
      sessionExpiresAt: null,
      updatedAt: this.now(),
    });
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
