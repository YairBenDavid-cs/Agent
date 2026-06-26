import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  ConnectGarminDto,
  ConnectGoogleCalendarDto,
  ConnectTelegramDto,
  VerifyGarminMfaDto,
} from '../application/dto/connect-integration.dto';
import { GarminConnectResponse } from '../application/dto/garmin-connect.response';
import { IntegrationStatusResponse } from '../application/dto/integration-status.response';
import { IntegrationsService } from '../application/integrations.service';

/**
 * Connect/replace credentials and read connection status. These endpoints only
 * ever ACCEPT secrets or RETURN secret-free status — decrypted credentials are
 * never reachable through this controller.
 */
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IntegrationStatusResponse[]> {
    return this.integrations.getStatuses(user.userId);
  }

  /**
   * Attempt a Garmin login. Returns `connected` on success, or `mfa_required`
   * with a `loginId` the client uses to submit the 2FA code.
   */
  @Put('garmin')
  async connectGarmin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectGarminDto,
  ): Promise<GarminConnectResponse> {
    return this.integrations.connectGarmin(user.userId, dto);
  }

  /** Complete a pending 2FA Garmin login with the user-supplied code. */
  @Put('garmin/mfa')
  async verifyGarminMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyGarminMfaDto,
  ): Promise<GarminConnectResponse> {
    return this.integrations.verifyGarminMfa(user.userId, dto);
  }

  /** Consent URL the browser is redirected to in order to start Google OAuth. */
  @Get('google-calendar/auth-url')
  googleCalendarAuthUrl(): { url: string } {
    return this.integrations.getGoogleCalendarAuthUrl();
  }

  @Put('google-calendar')
  @HttpCode(204)
  async connectGoogleCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectGoogleCalendarDto,
  ): Promise<void> {
    await this.integrations.connectGoogleCalendar(user.userId, dto);
  }

  @Put('telegram')
  @HttpCode(204)
  async connectTelegram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectTelegramDto,
  ): Promise<void> {
    await this.integrations.connectTelegram(user.userId, dto);
  }
}
